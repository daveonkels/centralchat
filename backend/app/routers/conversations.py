from fastapi import APIRouter, Query, HTTPException, Response
from typing import Optional, Literal
import json
import sqlite3

from ..database import get_connection, get_conversation, list_conversations, get_stats, conversation_neighbors
from ..models import ConversationDetail, ConversationList, StatsResponse, ConversationNeighbors, ContentAttribute
from ..content_attributes import matching_conversation_ids
from .search import normalize_before

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationList])
def list_all_conversations(
    response: Response,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    sort: Literal['newest', 'oldest'] = Query('newest'),
    attribute: Optional[ContentAttribute] = None,
    group_by: Literal['date', 'source', 'none'] = Query('date'),
):
    """List conversations with pagination."""
    with get_connection() as conn:
        attribute_ids = matching_conversation_ids(conn, attribute, platform)
        results = list_conversations(conn, limit=limit, offset=offset, platform=platform, sort=sort, attribute_ids=attribute_ids, group_by=group_by)
        total = len(attribute_ids) if attribute_ids is not None else conn.execute(
            'SELECT COUNT(*) FROM conversations' + (' WHERE platform = ?' if platform else ''),
            [platform] if platform else [],
        ).fetchone()[0]
        response.headers['X-Total-Count'] = str(total)

    return [ConversationList(**r) for r in results]


@router.get("/stats", response_model=StatsResponse)
def get_statistics():
    """Get database statistics."""
    with get_connection() as conn:
        stats = get_stats(conn)

    return StatsResponse(**stats)


@router.get("/{conversation_id}/neighbors", response_model=ConversationNeighbors)
def get_neighbors(
    conversation_id: str, q: Optional[str] = Query(None, min_length=1),
    platform: Optional[str] = None, role: Optional[str] = None,
    before: Optional[str] = None,
    sort: Literal['relevance', 'newest', 'oldest'] = Query('newest'),
    attribute: Optional[ContentAttribute] = None,
    group_by: Literal['date', 'source', 'none'] = Query('date'),
):
    before = normalize_before(before)
    try:
        with get_connection() as conn:
            attribute_ids = matching_conversation_ids(conn, attribute, platform)
            return conversation_neighbors(conn, conversation_id, q, platform, role, before, sort, attribute_ids, group_by)
    except sqlite3.OperationalError:
        raise HTTPException(status_code=400, detail="Invalid search query")


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation_detail(conversation_id: str):
    """Get a conversation with all its messages."""
    with get_connection() as conn:
        conv = get_conversation(conn, conversation_id)

    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Parse media JSON for each message
    for msg in conv.get("messages", []):
        if msg.get("media"):
            try:
                media_data = json.loads(msg["media"])
                # Filter out null/empty entries
                msg["media"] = [m for m in media_data if m and m.get("id")]
            except (json.JSONDecodeError, TypeError):
                msg["media"] = []
        else:
            msg["media"] = []

    return ConversationDetail(**conv)
