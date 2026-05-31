from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class MessageBase(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: str
    sequence: Optional[int] = None
    parent_id: Optional[str] = None
    metadata: Optional[str] = None


class MediaRef(BaseModel):
    id: int
    media_type: str
    original_path: str
    filename: Optional[str] = None


class MessageWithMedia(MessageBase):
    media: Optional[list[MediaRef]] = None


class ConversationBase(BaseModel):
    id: str
    platform: str
    title: Optional[str] = None
    summary: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    model: Optional[str] = None
    is_archived: bool = False


class ConversationList(ConversationBase):
    message_count: int = 0


class ConversationDetail(ConversationBase):
    messages: list[MessageWithMedia] = []


class SearchResult(BaseModel):
    conversation_id: str
    message_id: Optional[str] = None
    entry_type: str
    snippet: str
    conversation_title: Optional[str] = None
    platform: str
    conversation_date: str
    role: Optional[str] = None
    content: Optional[str] = None
    message_date: Optional[str] = None
    rank: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int
    query: str


class ImportStatus(BaseModel):
    platform: str
    source_path: str
    status: str
    conversations_found: int = 0
    conversations_imported: int = 0
    messages_imported: int = 0
    errors: list[str] = Field(default_factory=list)


class ImportScanResult(BaseModel):
    detected_exports: list[dict]
    skipped_exports: list[dict] = Field(default_factory=list)
    total_folders: int


class ImportJobResponse(BaseModel):
    job_id: str
    statuses: list[ImportStatus]
    completed: bool = False
    canceled: bool = False


class PurgeRequest(BaseModel):
    platforms: list[str] = Field(default_factory=list)


class PurgeResult(BaseModel):
    platform: str
    conversations_deleted: int
    messages_deleted: int
    media_deleted: int
    imports_deleted: int


class PurgeResponse(BaseModel):
    results: list[PurgeResult]


class StatsResponse(BaseModel):
    total_conversations: int
    total_messages: int
    by_platform: dict[str, int]
    imports: list[dict]
    last_imported: Optional[str] = None
