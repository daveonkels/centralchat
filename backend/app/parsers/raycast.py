import json
import hashlib
from pathlib import Path
from typing import Iterator

from .base import BaseParser, ParsedConversation, ParsedMessage


class RaycastParser(BaseParser):
    """Parser for Raycast AI chat export format."""

    platform = "raycast"
    json_filenames = ("raycast_ai_chats.json",)
    filename_keywords = ("raycast", "ai_chats", "chats")

    @classmethod
    def can_parse(cls, path: Path) -> bool:
        """Check for Raycast export signature: raycast_ai_chats.json with sessions."""
        return cls._find_chats_file(path) is not None

    @classmethod
    def _find_chats_file(cls, path: Path) -> Path | None:
        """Find a Raycast AI chats JSON file, including renamed exports."""
        for chat_file in cls.candidate_json_files(path):
            try:
                with open(chat_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict) and "sessions" in data and "exported_at" in data:
                        return chat_file
            except (json.JSONDecodeError, KeyError, OSError, UnicodeDecodeError):
                continue
        return None

    @classmethod
    def _load_chats(cls, path: Path) -> dict:
        chat_file = cls._find_chats_file(path)
        if not chat_file:
            raise ValueError("Could not find a Raycast AI chats JSON file")
        try:
            with open(chat_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
            raise ValueError(f"Could not read Raycast export: {exc}") from exc

    @classmethod
    def parse(cls, path: Path) -> Iterator[ParsedConversation]:
        """Parse Raycast export and yield conversations."""
        data = cls._load_chats(path)

        export_date = data.get("exported_at", "")
        sessions = data.get("sessions", [])

        for session in sessions:
            title = session.get("title", "")
            index = session.get("index", 0)

            # Use session date if available, otherwise fall back to export date
            # New format has per-session dates (YYYY-MM-DD), old format doesn't
            session_date = session.get("date")
            if session_date:
                # Convert YYYY-MM-DD to ISO format
                created_at = f"{session_date}T00:00:00"
            else:
                created_at = export_date

            # Generate a deterministic ID based on title and index
            id_source = f"{title}:{index}:{export_date}"
            conv_id = hashlib.sha256(id_source.encode()).hexdigest()[:32]

            # Try to infer model from title prefix
            model = cls._infer_model(title)

            conv = ParsedConversation(
                id=conv_id,
                platform=cls.platform,
                title=title,
                created_at=created_at,
                updated_at=None,
                summary=None,
                model=model,
                is_archived=False,
                metadata=json.dumps({"original_index": index}),
            )

            messages = session.get("messages", [])
            for seq, msg_data in enumerate(messages):
                role = msg_data.get("role", "unknown")
                content = msg_data.get("content", "")

                # Generate deterministic message ID
                msg_id_source = f"{conv_id}:{seq}:{role}"
                msg_id = hashlib.sha256(msg_id_source.encode()).hexdigest()[:32]

                msg = ParsedMessage(
                    id=msg_id,
                    conversation_id=conv_id,
                    role=role,
                    content=content,
                    created_at=created_at,  # Use session date when available
                    sequence=seq,
                    parent_id=None,
                    metadata=None,
                )
                conv.messages.append(msg)

            yield conv

    @staticmethod
    def _infer_model(title: str) -> str | None:
        """Infer model from conversation title prefix."""
        title_lower = title.lower()

        if "claude" in title_lower:
            return "claude"
        elif "openai" in title_lower or "gpt" in title_lower:
            return "gpt"
        elif "gemini" in title_lower or "google" in title_lower:
            return "gemini"
        elif "llama" in title_lower or "meta" in title_lower:
            return "llama"

        return None
