from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from pathlib import Path
from datetime import datetime, timedelta
import os
import json
import shutil
import threading
import tempfile
import uuid
import zipfile
from functools import wraps
from typing import Callable

from ..database import (
    get_connection,
    insert_conversation,
    insert_message,
    insert_media_ref,
    rebuild_fts_index,
    purge_platform_data,
)
from ..models import (
    ImportStatus,
    ImportScanResult,
    ImportJobResponse,
    PurgeRequest,
    PurgeResult,
    PurgeResponse,
)
from ..parsers.claude import ClaudeParser
from ..parsers.openai import OpenAIParser
from ..parsers.raycast import RaycastParser
from ..raycast_identity import plan_raycast_import

router = APIRouter(prefix="/api/import", tags=["import"])

IMPORTS_PATH = os.environ.get("IMPORTS_PATH", "/app/imports")

# Registry of available parsers
PARSERS = [ClaudeParser, OpenAIParser, RaycastParser]
AVAILABLE_PLATFORMS = {parser.platform for parser in PARSERS}

JOB_TTL_SECONDS = 1800
IMPORT_JOBS: dict[str, dict] = {}
IMPORT_JOBS_LOCK = threading.Lock()
IMPORT_START_LOCK = threading.Lock()


def exclusive_import_operation(fn):
    """Atomically reserve a writer, including synchronous upload/purge requests."""
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not IMPORT_START_LOCK.acquire(blocking=False):
            raise HTTPException(status_code=409, detail="Another data operation is running")
        try:
            if has_active_import_job():
                raise HTTPException(status_code=409, detail="An import is already running")
            return fn(*args, **kwargs)
        finally:
            IMPORT_START_LOCK.release()
    return wrapped


def detect_platform_from_filename(filename: str) -> str | None:
    """Detect platform from filename keywords (case-insensitive)."""
    name_lower = filename.lower()
    if "openai" in name_lower or "chatgpt" in name_lower:
        return "openai"
    if "anthropic" in name_lower or "claude" in name_lower:
        return "claude"
    if "raycast" in name_lower:
        return "raycast"
    return None


def detect_platform(path: Path) -> str | None:
    """Detect which platform an export belongs to."""
    for parser in PARSERS:
        if parser.can_parse(path):
            return parser.platform
    return None


def get_parser(platform: str):
    """Get parser class for a platform."""
    for parser in PARSERS:
        if parser.platform == platform:
            return parser
    return None


def _utcnow() -> datetime:
    return datetime.utcnow()


def cleanup_jobs(exclude_job_id: str | None = None):
    cutoff = _utcnow() - timedelta(seconds=JOB_TTL_SECONDS)
    with IMPORT_JOBS_LOCK:
        to_delete = [
            job_id for job_id, job in IMPORT_JOBS.items()
            if job_id != exclude_job_id
            and job.get("completed")
            and job.get("updated_at") < cutoff
        ]
        for job_id in to_delete:
            del IMPORT_JOBS[job_id]


def has_active_import_job() -> bool:
    with IMPORT_JOBS_LOCK:
        return any(not job.get("completed") for job in IMPORT_JOBS.values())


def create_import_job(statuses: list[ImportStatus], completed: bool = False) -> str:
    job_id = uuid.uuid4().hex
    now = _utcnow()
    with IMPORT_JOBS_LOCK:
        IMPORT_JOBS[job_id] = {
            "statuses": statuses,
            "completed": completed,
            "canceled": False,
            "created_at": now,
            "updated_at": now,
        }
    cleanup_jobs(exclude_job_id=job_id)
    return job_id


def mark_job_completed(job_id: str):
    with IMPORT_JOBS_LOCK:
        job = IMPORT_JOBS.get(job_id)
        if job:
            job["completed"] = True
            job["updated_at"] = _utcnow()
    cleanup_jobs(exclude_job_id=job_id)


def is_job_canceled(job_id: str) -> bool:
    with IMPORT_JOBS_LOCK:
        job = IMPORT_JOBS.get(job_id)
        return bool(job and job.get("canceled"))


def get_job_snapshot(job_id: str) -> ImportJobResponse:
    with IMPORT_JOBS_LOCK:
        job = IMPORT_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Import job not found")
        job["updated_at"] = _utcnow()
        statuses = [status.model_copy() for status in job["statuses"]]
        completed = job["completed"]
        canceled = job.get("canceled", False)
    cleanup_jobs(exclude_job_id=job_id)
    return ImportJobResponse(
        job_id=job_id,
        statuses=statuses,
        completed=completed,
        canceled=canceled,
    )


def resolve_import_folder(folder_name: str) -> Path | None:
    """Resolve a folder under IMPORTS_PATH, preventing path traversal."""
    imports_path = Path(IMPORTS_PATH).resolve()
    target = (imports_path / folder_name).resolve()
    try:
        target.relative_to(imports_path)
    except ValueError:
        return None
    return target


def _save_upload_file(upload: UploadFile, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as f:
        shutil.copyfileobj(upload.file, f)


def _safe_extract_zip(zip_path: Path, extract_to: Path):
    extract_to.mkdir(parents=True, exist_ok=True)
    extract_root = extract_to.resolve()
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            target_path = (extract_to / info.filename).resolve()
            try:
                target_path.relative_to(extract_root)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid archive paths detected")

            if info.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, target_path.open("wb") as dest:
                shutil.copyfileobj(source, dest)


def _find_export_folder(root: Path) -> tuple[Path, str] | None:
    """Find a valid export folder in extracted archive.

    Checks:
    1. Root directory for valid export
    2. Child directories for valid exports
    3. JSON files with platform keywords in filename
    """
    platform = detect_platform(root)
    if platform:
        return root, platform

    for child in sorted(root.rglob("*")):
        if child.is_dir():
            platform = detect_platform(child)
            if platform:
                return child, platform

    # Check for JSON files with platform keywords in filename
    for child in root.iterdir():
        if child.is_file() and child.suffix.lower() == ".json":
            filename_platform = detect_platform_from_filename(child.name)
            if filename_platform:
                # Create a folder and copy the file with expected name
                export_folder = root / "export"
                export_folder.mkdir(parents=True, exist_ok=True)
                expected_name = "raycast_ai_chats.json" if filename_platform == "raycast" else "conversations.json"
                shutil.copy2(child, export_folder / expected_name)
                platform = detect_platform(export_folder)
                if platform:
                    return export_folder, platform

    return None


def _detect_platform_from_json_folder(folder: Path, uploaded_path: Path) -> str | None:
    """Detect platform from uploaded JSON file.

    Detection order:
    1. Try filename-based detection (openai/chatgpt, anthropic/claude, raycast)
    2. Try content-based detection with current filename
    3. Fall back to renaming and re-checking
    """
    if uploaded_path.suffix.lower() != ".json":
        return None

    # Try filename-based detection first
    filename_platform = detect_platform_from_filename(uploaded_path.name)
    if filename_platform:
        # Rename to expected filename for the detected platform
        expected_name = "raycast_ai_chats.json" if filename_platform == "raycast" else "conversations.json"
        expected_path = folder / expected_name
        if uploaded_path.name != expected_name and not expected_path.exists():
            shutil.copy2(uploaded_path, expected_path)
        # Verify content matches the expected platform
        platform = detect_platform(folder)
        if platform:
            return platform

    # Try content-based detection with current filename
    platform = detect_platform(folder)
    if platform:
        return platform

    # Fall back: try renaming to standard names
    fallback_names = []
    if uploaded_path.name != "conversations.json":
        fallback_names.append("conversations.json")
    if uploaded_path.name != "raycast_ai_chats.json":
        fallback_names.append("raycast_ai_chats.json")

    for name in fallback_names:
        candidate_path = folder / name
        if candidate_path.exists():
            continue
        shutil.copy2(uploaded_path, candidate_path)
        platform = detect_platform(folder)
        if platform:
            return platform

    return None


def _undetected_folder_reason(folder: Path) -> str:
    """Return a concise reason why an import folder was skipped."""
    try:
        json_files = [
            child for child in folder.iterdir()
            if child.is_file() and child.suffix.lower() == ".json"
        ]
    except OSError as exc:
        return f"Could not read folder: {exc}"

    if not json_files:
        return "No JSON export files found in the folder root"

    hinted = [
        child.name for child in json_files
        if detect_platform_from_filename(child.name)
    ]
    if hinted:
        preview = ", ".join(hinted[:3])
        if len(hinted) > 3:
            preview += ", ..."
        return f"Found {preview}, but the content did not match a supported export format"

    return "Could not detect export format from the JSON files in this folder"


@router.get("/scan", response_model=ImportScanResult)
def scan_imports():
    """Discover root/nested exports without writing to the read-only source mount."""
    imports_path = Path(IMPORTS_PATH).resolve()
    detected = []
    skipped = []
    errors = []
    total_folders = 0

    def visit(folder: Path):
        nonlocal total_folders
        name = str(folder.relative_to(imports_path)) if folder != imports_path else "."
        try:
            children = sorted(folder.iterdir())
            total_folders += 1
            # Do not follow symlinks outside (or back into) the imports tree.
            if any(child.is_symlink() for child in children):
                skipped.append({"path": str(folder), "name": name,
                                "reason": "Symbolic links are not scanned; use real export files"})
                return
            platform = detect_platform(folder)
            if platform:
                parser = get_parser(platform)
                if platform == "openai":
                    files = parser._find_conversation_files(folder)
                    invalid = [p.name for p in folder.glob("conversations-*.json") if p not in files and p.read_text().strip() != "[]"]
                    if invalid:
                        skipped.append({"path": str(folder), "name": name,
                                        "reason": "Unreadable or unsupported conversation parts: " + ", ".join(invalid) + ". Finish copying the export, then rescan."})
                        return
                elif platform == "claude":
                    files = [parser._find_conversations_file(folder)]
                else:
                    files = [parser._find_chats_file(folder)]
                detected.append({"path": str(folder), "name": name, "platform": platform,
                                 "file_count": len(files), "files": [p.name for p in files]})
                return  # Export assets are not additional exports.
            subfolders = [child for child in children if child.is_dir() and not child.name.startswith((".", "__MACOSX"))]
            if not subfolders and folder != imports_path:
                skipped.append({"path": str(folder), "name": name,
                                "reason": _undetected_folder_reason(folder)})
            for child in children:
                if child.is_file() and child.suffix.lower() == ".zip":
                    skipped.append({"path": str(child), "name": str(child.relative_to(imports_path)),
                                    "reason": "Extract this ZIP into a folder here, or use Upload & Import"})
            for child in subfolders:
                visit(child)
        except (OSError, ValueError, TypeError) as exc:
            skipped.append({
                "path": str(folder), "name": name, "reason": f"Could not scan export: {exc}",
            })

    if not imports_path.is_dir():
        errors.append("Imports folder is missing or unavailable. Check the server's imports mount.")
    else:
        visit(imports_path)
    return ImportScanResult(
        detected_exports=detected, skipped_exports=skipped,
        total_folders=max(0, total_folders - 1),
        imports_path=os.environ.get("IMPORTS_DISPLAY_PATH", str(imports_path)), errors=errors,
    )


@router.post("/upload", response_model=ImportStatus)
@exclusive_import_operation
def upload_import(file: UploadFile = File(...)):
    """Upload a single export file (zip or json) and import it immediately."""
    if has_active_import_job():
        raise HTTPException(
            status_code=409,
            detail="Cannot upload while an import job is running",
        )

    filename = Path(file.filename or "upload").name
    if not filename:
        raise HTTPException(status_code=400, detail="Upload must include a filename")

    with tempfile.TemporaryDirectory(prefix="central-chat-upload-") as temp_dir:
        temp_path = Path(temp_dir)
        upload_path = temp_path / filename
        _save_upload_file(file, upload_path)

        platform = None
        folder = None

        if zipfile.is_zipfile(upload_path):
            extract_dir = temp_path / "extracted"
            try:
                _safe_extract_zip(upload_path, extract_dir)
            except zipfile.BadZipFile as exc:
                raise HTTPException(status_code=400, detail="Invalid zip file") from exc

            found = _find_export_folder(extract_dir)
            if found:
                folder, platform = found
        else:
            if upload_path.suffix.lower() != ".json":
                raise HTTPException(
                    status_code=400,
                    detail="Unsupported file type. Upload a .zip or .json export.",
                )
            folder = temp_path / "export"
            folder.mkdir(parents=True, exist_ok=True)
            target_path = folder / filename
            if upload_path != target_path:
                shutil.move(upload_path, target_path)
            platform = _detect_platform_from_json_folder(folder, target_path)

        if not folder or not platform:
            raise HTTPException(status_code=400, detail="Could not detect export format")

        status = ImportStatus(
            platform=platform,
            source_path=filename,
            status="running",
        )
        return import_export(
            folder,
            platform,
            status=status,
            rebuild_fts=True,
            source_label=f"upload:{filename}",
        )


@router.post("/run", response_model=ImportJobResponse)
@exclusive_import_operation
def run_import(background_tasks: BackgroundTasks):
    """Run import for all detected exports."""
    scan = scan_imports()
    if scan.errors:
        raise HTTPException(status_code=400, detail="; ".join(scan.errors))
    results = []
    to_process = []
    for export in scan.detected_exports:
        folder, platform = Path(export["path"]), export["platform"]
        status = ImportStatus(platform=platform, source_path=str(folder), status="queued")
        results.append(status)
        to_process.append((folder, platform, status))

    if not results:
        job_id = create_import_job([], completed=True)
        return get_job_snapshot(job_id)

    job_id = create_import_job(results, completed=False)
    if to_process:
        background_tasks.add_task(run_import_job, job_id, to_process)
    else:
        mark_job_completed(job_id)

    return get_job_snapshot(job_id)


@router.get("/active", response_model=ImportJobResponse | None)
def active_import():
    """Reconnect the modal to an import still running on the server."""
    with IMPORT_JOBS_LOCK:
        job_id = next((key for key, job in IMPORT_JOBS.items() if not job["completed"]), None)
    return get_job_snapshot(job_id) if job_id else None


@router.get("/status/{job_id}", response_model=ImportJobResponse)
def import_status(job_id: str):
    """Get status for an import job."""
    return get_job_snapshot(job_id)


@router.post("/cancel/{job_id}", response_model=ImportJobResponse)
def cancel_import(job_id: str):
    """Cancel an import job."""
    with IMPORT_JOBS_LOCK:
        job = IMPORT_JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Import job not found")
        if not job["completed"]:
            job["canceled"] = True
            job["updated_at"] = _utcnow()
            for status in job["statuses"]:
                if status.status in ("queued", "running"):
                    status.status = "canceled"
        statuses = [status.model_copy() for status in job["statuses"]]
        completed = job["completed"]
        canceled = job.get("canceled", False)
    cleanup_jobs(exclude_job_id=job_id)
    return ImportJobResponse(
        job_id=job_id,
        statuses=statuses,
        completed=completed,
        canceled=canceled,
    )


@router.post("/purge", response_model=PurgeResponse)
@exclusive_import_operation
def purge_platforms(request: PurgeRequest):
    """Permanently delete all data for one or more platforms."""
    platforms = [p.strip().lower() for p in request.platforms if p and p.strip()]
    if not platforms:
        raise HTTPException(status_code=400, detail="No platforms provided")

    invalid = [p for p in platforms if p not in AVAILABLE_PLATFORMS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported platforms: {', '.join(sorted(set(invalid)))}",
        )

    if has_active_import_job():
        raise HTTPException(
            status_code=409,
            detail="Cannot purge while an import job is running",
        )

    results: list[PurgeResult] = []
    with get_connection() as conn:
        try:
            conn.execute("BEGIN")
            for platform in sorted(set(platforms)):
                counts = purge_platform_data(conn, platform)
                results.append(PurgeResult(platform=platform, **counts))
            rebuild_fts_index(conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    return PurgeResponse(results=results)


@router.post("/run/{folder_name}", response_model=ImportStatus)
@exclusive_import_operation
def run_import_single(folder_name: str):
    """Run import for a specific export folder."""
    folder = resolve_import_folder(folder_name)

    if not folder or not folder.exists() or not folder.is_dir():
        return ImportStatus(
            platform="unknown",
            source_path=str(folder_name),
            status="error",
            errors=["Folder not found or invalid path"],
        )

    platform = detect_platform(folder)
    if not platform:
        return ImportStatus(
            platform="unknown",
            source_path=str(folder),
            status="error",
            errors=[_undetected_folder_reason(folder)],
        )

    return import_export(folder, platform, rebuild_fts=True)


def run_import_job(job_id: str, to_process: list[tuple[Path, str, ImportStatus]]):
    """Background task to process import job."""
    for folder, platform, status in to_process:
        if is_job_canceled(job_id):
            break
        status.status = "running"
        import_export(
            folder,
            platform,
            status=status,
            rebuild_fts=False,
            cancel_check=lambda: is_job_canceled(job_id),
        )
        if is_job_canceled(job_id):
            break

    if is_job_canceled(job_id):
        with IMPORT_JOBS_LOCK:
            job = IMPORT_JOBS.get(job_id)
            if job:
                for status in job["statuses"]:
                    if status.status == "queued":
                        status.status = "canceled"

    try:
        with get_connection() as conn:
            rebuild_fts_index(conn)
    except Exception as exc:
        for _, _, status in to_process:
            if status.status == "completed":
                status.status = "error"
                status.errors.append(f"Data was saved, but search indexing failed: {exc}. Re-import to retry.")
    finally:
        mark_job_completed(job_id)


def import_export(
    folder: Path,
    platform: str,
    status: ImportStatus | None = None,
    rebuild_fts: bool = True,
    cancel_check: Callable[[], bool] | None = None,
    source_label: str | None = None,
) -> ImportStatus:
    """Import an export folder."""
    parser = get_parser(platform)
    if not parser:
        if status is None:
            status = ImportStatus(
                platform=platform,
                source_path=str(folder),
                status="error",
                errors=[f"No parser available for platform: {platform}"],
            )
        else:
            status.status = "error"
            status.errors.append(f"No parser available for platform: {platform}")
        return status

    if status is None:
        status = ImportStatus(
            platform=platform,
            source_path=str(folder),
            status="running",
        )
    else:
        if status.status != "canceled":
            status.status = "running"

    try:
        with get_connection() as conn:
            # Create import record
            cursor = conn.execute(
                """
                INSERT INTO imports (platform, import_date, source_path)
                VALUES (?, ?, ?)
                """,
                (platform, datetime.now().isoformat(), source_label or str(folder)),
            )
            import_id = cursor.lastrowid

            conversations_imported = 0
            messages_imported = 0

            parsed = parser.parse(folder)
            raycast_plans = plan_raycast_import(conn, list(parsed)) if platform == 'raycast' else None
            entries = (
                ((plan.conversation, plan) for plan in raycast_plans)
                if raycast_plans is not None else ((conv, None) for conv in parsed)
            )
            for conv, plan in entries:
                if cancel_check and cancel_check():
                    status.status = "canceled"
                    break
                status.conversations_found += 1
                if plan and plan.error:
                    index = json.loads(conv.metadata or '{}').get('original_index', '?')
                    status.errors.append(f'Raycast session {index} skipped: {plan.error} No existing messages were changed.')
                    continue
                conv_dict = conv.to_dict()
                conv_dict["import_id"] = import_id

                # Re-imports refresh conversation metadata and merge any new messages.
                if insert_conversation(conn, conv_dict):
                    conversations_imported += 1

                for msg in conv.messages:
                    if insert_message(conn, msg.to_dict()):
                        messages_imported += 1

                for media in conv.media_refs:
                    insert_media_ref(conn, media.to_dict())
                if plan:
                    conn.execute(
                        'INSERT OR IGNORE INTO raycast_import_aliases (snapshot_id, conversation_id) VALUES (?, ?)',
                        (plan.snapshot_id, conv.id),
                    )

            # Update import record with counts
            conn.execute(
                """
                UPDATE imports
                SET conversation_count = ?, message_count = ?
                WHERE id = ?
                """,
                (conversations_imported, messages_imported, import_id),
            )

            conn.commit()

            # Rebuild FTS index
            if rebuild_fts:
                rebuild_fts_index(conn)

            status.conversations_imported = conversations_imported
            status.messages_imported = messages_imported
            if status.status != "canceled":
                status.status = "completed"

    except Exception as e:
        status.status = "error"
        status.errors.append(str(e))

    return status
