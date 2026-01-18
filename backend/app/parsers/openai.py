import json
from datetime import datetime
from pathlib import Path
from typing import Iterator
import re

from .base import BaseParser, ParsedConversation, ParsedMessage, ParsedMediaRef


class OpenAIParser(BaseParser):
    """Parser for ChatGPT/OpenAI export format."""

    platform = "openai"

    @classmethod
    def can_parse(cls, path: Path) -> bool:
        """Check for OpenAI export signature: conversations.json with mapping structure."""
        conv_file = path / "conversations.json"
        if not conv_file.exists():
            return False

        try:
            with open(conv_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list) and len(data) > 0:
                    first = data[0]
                    return "mapping" in first and "create_time" in first
        except (json.JSONDecodeError, KeyError):
            pass

        return False

    @classmethod
    def parse(cls, path: Path) -> Iterator[ParsedConversation]:
        """Parse OpenAI export and yield conversations."""
        conv_file = path / "conversations.json"

        with open(conv_file, "r", encoding="utf-8") as f:
            conversations = json.load(f)

        for conv_data in conversations:
            created_at = cls._unix_to_iso(conv_data.get("create_time"))
            updated_at = cls._unix_to_iso(conv_data.get("update_time"))

            conv = ParsedConversation(
                id=conv_data.get("id") or conv_data.get("conversation_id") or cls.generate_id(),
                platform=cls.platform,
                title=conv_data.get("title"),
                created_at=created_at,
                updated_at=updated_at,
                summary=None,
                model=conv_data.get("default_model_slug"),
                is_archived=conv_data.get("is_archived", False),
                metadata=json.dumps({
                    "is_starred": conv_data.get("is_starred", False),
                    "conversation_origin": conv_data.get("conversation_origin"),
                }),
            )

            # Parse the tree-based message mapping
            mapping = conv_data.get("mapping", {})
            messages = cls._flatten_message_tree(mapping, conv.id, created_at, path)

            conv.messages = [m for m, _ in messages]
            conv.media_refs = [ref for _, refs in messages for ref in refs]

            yield conv

    @classmethod
    def _flatten_message_tree(
        cls, mapping: dict, conv_id: str, fallback_time: str, export_path: Path
    ) -> list[tuple[ParsedMessage, list[ParsedMediaRef]]]:
        """Flatten the tree structure to a linear sequence of messages."""
        results = []

        # Find root node (no parent or parent is None)
        roots = [
            node_id for node_id, node in mapping.items()
            if node.get("parent") is None
        ]

        visited = set()
        seq = 0

        def traverse(node_id: str):
            nonlocal seq
            if node_id in visited:
                return
            visited.add(node_id)

            node = mapping.get(node_id, {})
            message = node.get("message")

            if message and message.get("content"):
                content_data = message["content"]
                content_type = content_data.get("content_type", "text")

                # Extract text content
                text = ""
                media_refs = []

                if content_type == "text":
                    parts = content_data.get("parts", [])
                    text_parts = []
                    for part in parts:
                        if isinstance(part, str):
                            text_parts.append(part)
                        elif isinstance(part, dict):
                            # Handle image references
                            if "image_url" in part or "asset_pointer" in part:
                                media_ref = cls._extract_media_ref(
                                    part, message.get("id", cls.generate_id()), export_path
                                )
                                if media_ref:
                                    media_refs.append(media_ref)
                    text = "\n".join(text_parts)

                elif content_type == "multimodal_text":
                    parts = content_data.get("parts", [])
                    text_parts = []
                    for part in parts:
                        if isinstance(part, str):
                            text_parts.append(part)
                        elif isinstance(part, dict):
                            if part.get("content_type") == "image_asset_pointer":
                                media_ref = cls._extract_media_ref(
                                    part, message.get("id", cls.generate_id()), export_path
                                )
                                if media_ref:
                                    media_refs.append(media_ref)
                    text = "\n".join(text_parts)

                if text.strip():
                    author = message.get("author", {})
                    role = cls._normalize_role(author.get("role", ""))

                    msg_time = cls._unix_to_iso(message.get("create_time")) or fallback_time

                    msg = ParsedMessage(
                        id=message.get("id", cls.generate_id()),
                        conversation_id=conv_id,
                        role=role,
                        content=text,
                        created_at=msg_time,
                        sequence=seq,
                        parent_id=node.get("parent"),
                        metadata=None,
                    )
                    results.append((msg, media_refs))
                    seq += 1

            # Traverse children
            for child_id in node.get("children", []):
                traverse(child_id)

        for root in roots:
            traverse(root)

        return results

    @classmethod
    def _extract_media_ref(cls, part: dict, message_id: str, export_path: Path) -> ParsedMediaRef | None:
        """Extract media reference from a content part."""
        # Try different ways OpenAI stores image references
        asset_pointer = part.get("asset_pointer") or part.get("image_url", {}).get("url", "")

        if not asset_pointer:
            return None

        # Extract file ID from asset pointer (e.g., "file-service://file-abc123")
        file_id_match = re.search(r"file-([a-zA-Z0-9]+)", asset_pointer)

        if file_id_match:
            file_id = file_id_match.group(0)
            # Look for matching file in export directory
            for img_file in export_path.glob(f"{file_id}*"):
                return ParsedMediaRef(
                    message_id=message_id,
                    media_type="image",
                    original_path=str(img_file),
                    filename=img_file.name,
                    metadata=None,
                )

        return ParsedMediaRef(
            message_id=message_id,
            media_type="image",
            original_path=asset_pointer,
            filename=None,
            metadata=None,
        )

    @staticmethod
    def _normalize_role(role: str) -> str:
        """Normalize role names."""
        if role in ("user", "assistant", "system"):
            return role
        if role == "tool":
            return "system"
        return role or "unknown"

    @staticmethod
    def _unix_to_iso(timestamp: float | None) -> str:
        """Convert Unix timestamp to ISO 8601 string."""
        if timestamp is None:
            return datetime.now().isoformat()
        try:
            return datetime.fromtimestamp(timestamp).isoformat()
        except (ValueError, OSError):
            return datetime.now().isoformat()
