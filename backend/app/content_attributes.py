"""Content hints derived from archived messages, never from conversation titles."""
import re
from pathlib import PurePosixPath

ATTRIBUTE_ORDER = ('code', 'images', 'tables', 'files', 'audio', 'video')
FENCE = re.compile(r'^ {0,3}(`{3,}|~{3,})(.*)$')
IMAGE = re.compile(r'(?<!\\)!\[[^\]\n]*\]\s*(?:\([^\n]+\)|\[[^\]\n]*\])')
TABLE_CELL = re.compile(r'^:?-{3,}:?$')


def _text_attributes(content: str):
    fence = None
    previous = ''
    for line in content.splitlines():
        match = FENCE.match(line) if line.lstrip().startswith(('```', '~~~')) else None
        if fence:
            if match and match[1][0] == fence[0] and len(match[1]) >= len(fence) and not match[2].strip():
                fence = None
            continue
        if match:
            yield 'code'
            fence = match[1]
            previous = ''
            continue
        if '![' in line and IMAGE.search(line):
            yield 'images'
        if '|' in line and '|' in previous:
            cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
            header = previous.strip().strip('|').split('|')
            if len(cells) == len(header) and all(TABLE_CELL.fullmatch(cell) for cell in cells):
                yield 'tables'
        previous = line


def text_attributes(content: str) -> set[str]:
    return set(_text_attributes(content))


def media_attribute(media_type: str, filename: str) -> str:
    kind = media_type.lower().split('/')[0]
    if kind in ('image', 'audio', 'video'):
        return {'image': 'images', 'audio': 'audio', 'video': 'video'}[kind]
    suffix = PurePosixPath(filename.lower()).suffix
    if suffix in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.svg', '.avif'):
        return 'images'
    if suffix in ('.mp3', '.wav', '.m4a', '.ogg', '.flac'):
        return 'audio'
    if suffix in ('.mp4', '.mov', '.webm', '.mkv'):
        return 'video'
    return 'files'


def conversation_attributes(conn, ids: list[str]) -> dict[str, list[str]]:
    """Two batched queries per page; no schema changes or per-row queries."""
    ids = list(dict.fromkeys(ids))
    found = {cid: set() for cid in ids}
    if not ids:
        return {}
    placeholders = ','.join('?' for _ in ids)
    for row in conn.execute(f'SELECT conversation_id, content FROM messages WHERE conversation_id IN ({placeholders})', ids):
        found[row['conversation_id']].update(text_attributes(row['content']))
    for row in conn.execute(f'''SELECT m.conversation_id, mr.media_type, mr.filename, mr.original_path
        FROM messages m JOIN media_refs mr ON mr.message_id = m.id
        WHERE m.conversation_id IN ({placeholders})''', ids):
        found[row['conversation_id']].add(media_attribute(row['media_type'], row['filename'] or row['original_path']))
    return {cid: [tag for tag in ATTRIBUTE_ORDER if tag in tags] for cid, tags in found.items()}


def matching_conversation_ids(conn, attribute: str | None, platform: str | None = None) -> list[str] | None:
    """Compute once per request, before pagination; imports need no index refresh."""
    if attribute is None:
        return None
    if attribute not in ATTRIBUTE_ORDER:
        raise ValueError('Unknown content attribute')
    # Cheap SQLite text checks narrow candidates before parsing Markdown. Stop
    # after the first qualifying message in each conversation. Media-only filters
    # never scan message text. This stays fresh without a separate stored index.
    platform_sql = ' AND c.platform = ?' if platform else ''
    params = [platform] if platform else []
    matches = set()
    if attribute in ('code', 'images', 'tables'):
        candidate_sql = {
            'code': "(instr(m.content, '```') > 0 OR instr(m.content, '~~~') > 0)",
            'images': "instr(m.content, '![') > 0",
            'tables': "instr(m.content, '|') > 0",
        }[attribute]
        for row in conn.execute(f'''SELECT m.conversation_id, m.content FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE {candidate_sql} {platform_sql}''', params):
            if row['conversation_id'] not in matches and any(tag == attribute for tag in _text_attributes(row['content'])):
                matches.add(row['conversation_id'])
    if attribute in ('images', 'files', 'audio', 'video'):
        for row in conn.execute(f'''SELECT m.conversation_id, mr.media_type, mr.filename, mr.original_path
            FROM media_refs mr JOIN messages m ON m.id = mr.message_id
            JOIN conversations c ON c.id = m.conversation_id WHERE 1=1 {platform_sql}''', params):
            if media_attribute(row['media_type'], row['filename'] or row['original_path']) == attribute:
                matches.add(row['conversation_id'])
    return sorted(matches)
