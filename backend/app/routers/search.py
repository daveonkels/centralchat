import sqlite3
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from ..database import get_connection, search, count_search_results
from ..models import SearchResponse, SearchResult

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResponse)
def search_chats(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    role: Optional[str] = Query(None, description="Filter by message role"),
):
    """Search across all messages and conversation titles."""
    try:
        with get_connection() as conn:
            results = search(conn, q, limit=limit, offset=offset, platform=platform, role=role)
            total = count_search_results(conn, q, platform=platform, role=role)
    except sqlite3.OperationalError:
        raise HTTPException(status_code=400, detail="Invalid search query")

    return SearchResponse(
        results=[SearchResult(**r) for r in results],
        total=total,
        query=q,
    )
