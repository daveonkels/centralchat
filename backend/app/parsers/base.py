from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterator
import uuid


class ParsedConversation:
    """Normalized conversation data."""

    def __init__(
        self,
        id: str,
        platform: str,
        title: str | None,
        created_at: str,
        updated_at: str | None = None,
        summary: str | None = None,
        model: str | None = None,
        is_archived: bool = False,
        metadata: str | None = None,
    ):
        self.id = id
        self.platform = platform
        self.title = title
        self.created_at = created_at
        self.updated_at = updated_at
        self.summary = summary
        self.model = model
        self.is_archived = is_archived
        self.metadata = metadata
        self.messages: list[ParsedMessage] = []
        self.media_refs: list[ParsedMediaRef] = []

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "platform": self.platform,
            "title": self.title,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "summary": self.summary,
            "model": self.model,
            "is_archived": self.is_archived,
            "metadata": self.metadata,
        }


class ParsedMessage:
    """Normalized message data."""

    def __init__(
        self,
        id: str,
        conversation_id: str,
        role: str,
        content: str,
        created_at: str,
        sequence: int | None = None,
        parent_id: str | None = None,
        metadata: str | None = None,
    ):
        self.id = id
        self.conversation_id = conversation_id
        self.role = role
        self.content = content
        self.created_at = created_at
        self.sequence = sequence
        self.parent_id = parent_id
        self.metadata = metadata

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at,
            "sequence": self.sequence,
            "parent_id": self.parent_id,
            "metadata": self.metadata,
        }


class ParsedMediaRef:
    """Normalized media reference."""

    def __init__(
        self,
        message_id: str,
        media_type: str,
        original_path: str,
        filename: str | None = None,
        metadata: str | None = None,
    ):
        self.message_id = message_id
        self.media_type = media_type
        self.original_path = original_path
        self.filename = filename
        self.metadata = metadata

    def to_dict(self) -> dict:
        return {
            "message_id": self.message_id,
            "media_type": self.media_type,
            "original_path": self.original_path,
            "filename": self.filename,
            "metadata": self.metadata,
        }


class BaseParser(ABC):
    """Base class for platform-specific parsers."""

    platform: str = "unknown"

    @classmethod
    @abstractmethod
    def can_parse(cls, path: Path) -> bool:
        """Check if this parser can handle the given export directory."""
        pass

    @classmethod
    @abstractmethod
    def parse(cls, path: Path) -> Iterator[ParsedConversation]:
        """Parse the export and yield normalized conversations."""
        pass

    @staticmethod
    def generate_id() -> str:
        """Generate a unique ID."""
        return str(uuid.uuid4())
