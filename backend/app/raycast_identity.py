"""Conservative identity reconciliation for exports without native chat IDs.

Plan against the pre-import archive, not conversations inserted earlier in the
same file. Match complete ordered transcripts (or a strict extension), never
titles, sidebar indices, approximate dates, or a single shared opening prompt.
Ambiguous matches are skipped and reported rather than merged arbitrarily.
"""
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json

from .parsers.base import ParsedConversation


@dataclass
class RaycastMatch:
    conversation: ParsedConversation
    snapshot_id: str
    error: str | None = None


def _export_time(metadata):
    try:
        value = json.loads(metadata or '{}').get('raycast_exported_at')
        if not value:
            return None
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError, AttributeError):
        return None


def _compatible(left, right):
    return bool(left and right) and left[:min(len(left), len(right))] == right[:min(len(left), len(right))]


def plan_raycast_import(conn, conversations: list[ParsedConversation]) -> list[RaycastMatch]:
    stored = {row['id']: dict(row) for row in conn.execute(
        "SELECT * FROM conversations WHERE platform = 'raycast'"
    )}
    messages = defaultdict(list)
    for row in conn.execute("""
        SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.platform = 'raycast' ORDER BY m.conversation_id, m.sequence, m.id
    """):
        messages[row['conversation_id']].append(dict(row))
    transcripts = {cid: [(m['role'], m['content']) for m in messages[cid]] for cid in stored}
    # Index the first message to avoid comparing every full transcript with every
    # archive conversation. The entire shorter history must still match exactly.
    by_opening = defaultdict(list)
    for cid, transcript in transcripts.items():
        if transcript:
            by_opening[transcript[0]].append(cid)
    aliases = dict(conn.execute('SELECT snapshot_id, conversation_id FROM raycast_import_aliases'))
    plans = [RaycastMatch(conv, conv.id) for conv in conversations]
    candidates = []
    for plan in plans:
        conv = plan.conversation
        transcript = [(m.role, m.content) for m in conv.messages]
        direct = aliases.get(plan.snapshot_id)
        if direct is None and plan.snapshot_id in stored:
            direct = plan.snapshot_id
        if direct:
            if not _compatible(transcript, transcripts[direct]) and transcript != transcripts[direct]:
                plan.error = 'A previously imported snapshot has different message content.'
                candidates.append([])
            else:
                candidates.append([direct])
            continue
        if not transcript or not any(content.strip() for _, content in transcript):
            plan.error = 'Empty chat has no message history to identify safely.'
            candidates.append([])
            continue
        possible = by_opening[transcript[0]]
        exact = [cid for cid in possible if transcript == transcripts[cid]]
        matches = exact or [cid for cid in possible if _compatible(transcript, transcripts[cid])]
        # One-message overlaps are too weak to identify a growing conversation.
        if any(min(len(transcript), len(transcripts[cid])) < 2 for cid in matches):
            plan.error = 'Only a single-message overlap is available; identity is uncertain.'
        candidates.append(matches)

    claims = Counter(cid for group in candidates for cid in group)
    snapshot_counts = Counter(plan.snapshot_id for plan in plans)
    for plan, matches in zip(plans, candidates):
        if snapshot_counts[plan.snapshot_id] > 1:
            plan.error = 'The export repeats the same session identity.'
        if len(matches) > 1 or any(claims[cid] > 1 for cid in matches):
            plan.error = 'Multiple chats share this message history; identity is ambiguous.'
        if plan.error or not matches:
            continue
        cid = matches[0]
        conv = plan.conversation
        old = stored[cid]
        old_messages = messages[cid]
        incoming_time = _export_time(conv.metadata)
        existing_time = _export_time(old['metadata'])
        # Old/partial exports must never roll the archive back or erase messages.
        if len(conv.messages) < len(old_messages) or (
            incoming_time and existing_time and incoming_time < existing_time
        ):
            conv.title, conv.model, conv.metadata = old['title'], old['model'], old['metadata']
        conv.id = cid
        conv.created_at = old['created_at']
        for index, message in enumerate(conv.messages):
            message.conversation_id = cid
            if index < len(old_messages):
                message.id = old_messages[index]['id']
                message.created_at = old_messages[index]['created_at']
            else:
                message.id = hashlib.sha256(f'{cid}:{index}:{message.role}'.encode()).hexdigest()[:32]
    return plans
