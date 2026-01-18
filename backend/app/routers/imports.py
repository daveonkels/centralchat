from fastapi import APIRouter, BackgroundTasks
from pathlib import Path
from datetime import datetime
import os

from ..database import (
    get_connection,
    insert_conversation,
    insert_message,
    insert_media_ref,
    rebuild_fts_index,
)
from ..models import ImportStatus, ImportScanResult
from ..parsers.claude import ClaudeParser
from ..parsers.openai import OpenAIParser
from ..parsers.raycast import RaycastParser

router = APIRouter(prefix="/api/import", tags=["import"])

IMPORTS_PATH = os.environ.get("IMPORTS_PATH", "/app/imports")

# Registry of available parsers
PARSERS = [ClaudeParser, OpenAIParser, RaycastParser]


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


@router.post("/run", response_model=list[ImportStatus])
def run_import(background_tasks: BackgroundTasks):
    """Run import for all detected exports."""
    imports_path = Path(IMPORTS_PATH)

    if not imports_path.exists():
        return []

    results = []
    folders = [d for d in imports_path.iterdir() if d.is_dir()]

    for folder in folders:
        platform = detect_platform(folder)
        if not platform:
            continue

        status = import_export(folder, platform)
        results.append(status)

    return results


@router.post("/run/{folder_name}", response_model=ImportStatus)
def run_import_single(folder_name: str):
    """Run import for a specific export folder."""
    imports_path = Path(IMPORTS_PATH)
    folder = imports_path / folder_name

    if not folder.exists() or not folder.is_dir():
        return ImportStatus(
            platform="unknown",
            source_path=str(folder),
            status="error",
            errors=[f"Folder not found: {folder_name}"],
        )

    platform = detect_platform(folder)
    if not platform:
        return ImportStatus(
            platform="unknown",
            source_path=str(folder),
            status="error",
            errors=["Could not detect export format"],
        )

    return import_export(folder, platform)


def import_export(folder: Path, platform: str) -> ImportStatus:
    """Import an export folder."""
    parser = get_parser(platform)
    if not parser:
        return ImportStatus(
            platform=platform,
            source_path=str(folder),
            status="error",
            errors=[f"No parser available for platform: {platform}"],
        )

    status = ImportStatus(
        platform=platform,
        source_path=str(folder),
        status="running",
    )

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
            rebuild_fts_index(conn)

            status.conversations_imported = conversations_imported
            status.messages_imported = messages_imported
            status.status = "completed"

    except Exception as e:
        status.status = "error"
        status.errors.append(str(e))

    return status
