from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import json

from ..database import get_connection, get_conversation, list_conversations, get_stats
from ..models import ConversationDetail, ConversationList, StatsResponse

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationList])
def list_all_conversations(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    platform: Optional[str] = Query(None, description="Filter by platform"),
):
    """List conversations with pagination."""
    with get_connection() as conn:
        results = list_conversations(conn, limit=limit, offset=offset, platform=platform)

    return [ConversationList(**r) for r in results]


@router.get("/stats", response_model=StatsResponse)
def get_statistics():
    """Get database statistics."""
    with get_connection() as conn:
        stats = get_stats(conn)

    return StatsResponse(**stats)


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
