import json
import hashlib
from pathlib import Path
from typing import Iterator

from .base import BaseParser, ParsedConversation, ParsedMessage


class RaycastParser(BaseParser):
    """Parser for Raycast AI chat export format."""

    platform = "raycast"

    @classmethod
    def can_parse(cls, path: Path) -> bool:
        """Check for Raycast export signature: raycast_ai_chats.json with sessions."""
        chat_file = path / "raycast_ai_chats.json"
        if not chat_file.exists():
            return False

        try:
            with open(chat_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return "sessions" in data and "exported_at" in data
        except (json.JSONDecodeError, KeyError):
            pass

        return False

    @classmethod
    def parse(cls, path: Path) -> Iterator[ParsedConversation]:
        """Parse Raycast export and yield conversations."""
        chat_file = path / "raycast_ai_chats.json"

        with open(chat_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        export_date = data.get("exported_at", "")
        sessions = data.get("sessions", [])

        for session in sessions:
            title = session.get("title", "")
            index = session.get("index", 0)

            # Generate a deterministic ID based on title and index
            id_source = f"{title}:{index}:{export_date}"
            conv_id = hashlib.sha256(id_source.encode()).hexdigest()[:32]

            # Try to infer model from title prefix
            model = cls._infer_model(title)

            conv = ParsedConversation(
                id=conv_id,
                platform=cls.platform,
                title=title,
                created_at=export_date,
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
                    created_at=export_date,  # No per-message timestamps
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
