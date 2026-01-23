import sqlite3
import re
from datetime import datetime
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from ..database import get_connection, search, count_search_results
from ..models import SearchResponse, SearchResult

router = APIRouter(prefix="/api/search", tags=["search"])

DATE_ONLY_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_before(before: str | None) -> str | None:
    if not before:
        return None

    value = before.strip()
    if not value:
        return None

    if DATE_ONLY_PATTERN.match(value):
        value = f"{value}T23:59:59"
    elif " " in value and "T" not in value:
        value = value.replace(" ", "T", 1)

    try:
        datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid before date. Use YYYY-MM-DD or ISO-8601.",
        ) from exc

    return value


@router.get("", response_model=SearchResponse)
def search_chats(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    role: Optional[str] = Query(None, description="Filter by message role"),
    before: Optional[str] = Query(None, description="Only results before this date"),
):
    """Search across all messages and conversation titles."""
    before_value = normalize_before(before)
    try:
        with get_connection() as conn:
            results = search(
                conn,
                q,
                limit=limit,
                offset=offset,
                platform=platform,
                role=role,
                before=before_value,
            )
            total = count_search_results(
                conn,
                q,
                platform=platform,
                role=role,
                before=before_value,
            )
    except sqlite3.OperationalError:
        raise HTTPException(status_code=400, detail="Invalid search query")

    return SearchResponse(
        results=[SearchResult(**r) for r in results],
        total=total,
        query=q,
    )
