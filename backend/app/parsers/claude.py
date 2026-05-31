import json
from pathlib import Path
from typing import Iterator

from .base import BaseParser, ParsedConversation, ParsedMessage


class ClaudeParser(BaseParser):
    """Parser for Claude.ai export format."""

    platform = "claude"
    json_filenames = ("conversations.json",)
    filename_keywords = ("claude", "anthropic", "conversation", "conversations")

    @classmethod
    def can_parse(cls, path: Path) -> bool:
        """Check for Claude export signature: conversations.json with uuid/chat_messages."""
        return cls._find_conversations_file(path) is not None

    @classmethod
    def _find_conversations_file(cls, path: Path) -> Path | None:
        """Find a Claude conversations JSON file, including renamed exports."""
        for conv_file in cls.candidate_json_files(path):
            try:
                with open(conv_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        first = data[0]
                        if "uuid" in first and "chat_messages" in first:
                            return conv_file
            except (json.JSONDecodeError, KeyError, OSError, UnicodeDecodeError):
                continue
        return None

    @classmethod
    def _load_conversations(cls, path: Path) -> list[dict]:
        conv_file = cls._find_conversations_file(path)
        if not conv_file:
            raise ValueError("Could not find a Claude conversations JSON file")
        try:
            with open(conv_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
            raise ValueError(f"Could not read Claude export: {exc}") from exc

    @classmethod
    def parse(cls, path: Path) -> Iterator[ParsedConversation]:
        """Parse Claude export and yield conversations."""
        conversations = cls._load_conversations(path)

        for conv_data in conversations:
            conv = ParsedConversation(
                id=conv_data["uuid"],
                platform=cls.platform,
                title=conv_data.get("name"),
                created_at=conv_data["created_at"],
                updated_at=conv_data.get("updated_at"),
                summary=conv_data.get("summary"),
                model=None,  # Claude export doesn't include model per-conversation
                is_archived=False,
                metadata=None,
            )

            messages = conv_data.get("chat_messages", [])
            for seq, msg_data in enumerate(messages):
                role = cls._normalize_role(msg_data.get("sender", ""))

                # Get content from either 'text' field or nested content array
                content = msg_data.get("text", "")
                if not content and "content" in msg_data:
                    content_parts = msg_data["content"]
                    if isinstance(content_parts, list):
                        content = "\n".join(
                            part.get("text", "")
                            for part in content_parts
                            if part.get("type") == "text"
                        )

                msg = ParsedMessage(
                    id=msg_data.get("uuid", cls.generate_id()),
                    conversation_id=conv.id,
                    role=role,
                    content=content,
                    created_at=msg_data.get("created_at", conv.created_at),
                    sequence=seq,
                    parent_id=None,
                    metadata=None,
                )
                conv.messages.append(msg)

                # Handle file attachments
                files = msg_data.get("files", [])
                for file_info in files:
                    from .base import ParsedMediaRef

                    media = ParsedMediaRef(
                        message_id=msg.id,
                        media_type="file",
                        original_path=str(path / file_info.get("file_name", "")),
                        filename=file_info.get("file_name"),
                        metadata=None,
                    )
                    conv.media_refs.append(media)

            yield conv

    @staticmethod
    def _normalize_role(sender: str) -> str:
        """Normalize sender to standard role."""
        if sender == "human":
            return "user"
        elif sender == "assistant" or sender == "claude":
            return "assistant"
        return sender or "unknown"
