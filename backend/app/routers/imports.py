from fastapi import APIRouter, BackgroundTasks, HTTPException
from pathlib import Path
from datetime import datetime, timedelta
import os
import threading
import uuid
from typing import Callable

from ..database import (
    get_connection,
    insert_conversation,
    insert_message,
    insert_media_ref,
    rebuild_fts_index,
)
from ..models import ImportStatus, ImportScanResult, ImportJobResponse
from ..parsers.claude import ClaudeParser
from ..parsers.openai import OpenAIParser
from ..parsers.raycast import RaycastParser

router = APIRouter(prefix="/api/import", tags=["import"])

IMPORTS_PATH = os.environ.get("IMPORTS_PATH", "/app/imports")

# Registry of available parsers
PARSERS = [ClaudeParser, OpenAIParser, RaycastParser]

JOB_TTL_SECONDS = 1800
IMPORT_JOBS: dict[str, dict] = {}
IMPORT_JOBS_LOCK = threading.Lock()


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


@router.get("/scan", response_model=ImportScanResult)
def scan_imports():
    """Scan the imports directory for export folders."""
    imports_path = Path(IMPORTS_PATH)

    if not imports_path.exists():
        return ImportScanResult(detected_exports=[], total_folders=0)

    detected = []
    folders = [d for d in imports_path.iterdir() if d.is_dir()]

    for folder in folders:
        platform = detect_platform(folder)
        if platform:
            detected.append({
                "path": str(folder),
                "name": folder.name,
                "platform": platform,
            })

    return ImportScanResult(detected_exports=detected, total_folders=len(folders))


@router.post("/run", response_model=ImportJobResponse)
def run_import(background_tasks: BackgroundTasks):
    """Run import for all detected exports."""
    imports_path = Path(IMPORTS_PATH)

    if not imports_path.exists():
        job_id = create_import_job([], completed=True)
        return get_job_snapshot(job_id)

    results = []
    to_process = []
    folders = [d for d in imports_path.iterdir() if d.is_dir()]

    for folder in folders:
        platform = detect_platform(folder)
        if platform:
            status = ImportStatus(
                platform=platform,
                source_path=str(folder),
                status="queued",
            )
            results.append(status)
            to_process.append((folder, platform, status))
        else:
            results.append(ImportStatus(
                platform="unknown",
                source_path=str(folder),
                status="error",
                errors=["Could not detect export format"],
            ))

    if not results:
        job_id = create_import_job([], completed=True)
        return get_job_snapshot(job_id)

    job_id = create_import_job(results, completed=False)
    if to_process:
        background_tasks.add_task(run_import_job, job_id, to_process)
    else:
        mark_job_completed(job_id)

    return get_job_snapshot(job_id)


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


@router.post("/run/{folder_name}", response_model=ImportStatus)
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
            errors=["Could not detect export format"],
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

    with get_connection() as conn:
        rebuild_fts_index(conn)

    mark_job_completed(job_id)


def import_export(
    folder: Path,
    platform: str,
    status: ImportStatus | None = None,
    rebuild_fts: bool = True,
    cancel_check: Callable[[], bool] | None = None,
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
                (platform, datetime.now().isoformat(), str(folder)),
            )
            import_id = cursor.lastrowid

            conversations_imported = 0
            messages_imported = 0

            for conv in parser.parse(folder):
                if cancel_check and cancel_check():
                    status.status = "canceled"
                    break
                conv_dict = conv.to_dict()
                conv_dict["import_id"] = import_id

                status.conversations_found += 1

                # Try to insert (will fail silently if duplicate)
                if insert_conversation(conn, conv_dict):
                    conversations_imported += 1

                    # Insert messages
                    for msg in conv.messages:
                        insert_message(conn, msg.to_dict())
                        messages_imported += 1

                    # Insert media refs
                    for media in conv.media_refs:
                        insert_media_ref(conn, media.to_dict())

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
