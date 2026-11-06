import sqlite3
import json
import os
from pathlib import Path
from contextlib import contextmanager
from .content_attributes import conversation_attributes

DATABASE_PATH = os.environ.get("DATABASE_PATH", "/app/data/central-chat.db")
MATCH_ALL_QUERY = "__cc_match_all__"
HIGHLIGHT_START = "__CC_HL_START__"
HIGHLIGHT_END = "__CC_HL_END__"
SOURCE_ORDER = "CASE c.platform WHEN 'openai' THEN 0 WHEN 'claude' THEN 1 WHEN 'raycast' THEN 2 ELSE 3 END, c.platform, "

SCHEMA = """
-- User-created archive views; kept separately from imported records.
CREATE TABLE IF NOT EXISTS saved_views (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Source exports tracking
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    import_date TEXT NOT NULL,
    source_path TEXT,
    conversation_count INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    import_id INTEGER REFERENCES imports(id),
    title TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    model TEXT,
    is_archived INTEGER DEFAULT 0,
    metadata TEXT
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sequence INTEGER,
    parent_id TEXT,
    metadata TEXT
);

-- Raycast exports have snapshot IDs, not persistent source conversation IDs.
-- Remember every accepted snapshot so replaying an older export is idempotent.
CREATE TABLE IF NOT EXISTS raycast_import_aliases (
    snapshot_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE
);

-- Media references
CREATE TABLE IF NOT EXISTS media_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT REFERENCES messages(id),
    media_type TEXT NOT NULL,
    original_path TEXT NOT NULL,
    filename TEXT,
    metadata TEXT
);

-- Full-text search index for messages and conversation titles
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    content,
    title,
    conversation_id UNINDEXED,
    message_id UNINDEXED,
    entry_type UNINDEXED,
    tokenize='porter unicode61'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_media_message ON media_refs(message_id);
"""


def get_db_path() -> Path:
    """Get database path, creating directory if needed."""
    path = Path(DATABASE_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def init_db():
    """Initialize database with schema."""
    db_path = get_db_path()
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


@contextmanager
def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    try:
        yield conn
    finally:
        conn.close()


def insert_conversation(conn: sqlite3.Connection, conv: dict) -> bool:
    """Insert or refresh a conversation, returning True when newly inserted."""
    try:
        conn.execute(
            """
            INSERT INTO conversations (id, platform, import_id, title, summary,
                                       created_at, updated_at, model, is_archived, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conv["id"],
                conv["platform"],
                conv.get("import_id"),
                conv.get("title"),
                conv.get("summary"),
                conv["created_at"],
                conv.get("updated_at"),
                conv.get("model"),
                conv.get("is_archived", False),
                conv.get("metadata"),
            ),
        )
        return True
    except sqlite3.IntegrityError:
        conn.execute(
            """
            UPDATE conversations
            SET title = COALESCE(?, title),
                summary = COALESCE(?, summary),
                updated_at = COALESCE(?, updated_at),
                model = COALESCE(?, model),
                is_archived = ?,
                metadata = COALESCE(?, metadata)
            WHERE id = ? AND platform = ?
            """,
            (
                conv.get("title"),
                conv.get("summary"),
                conv.get("updated_at"),
                conv.get("model"),
                conv.get("is_archived", False),
                conv.get("metadata"),
                conv["id"],
                conv["platform"],
            ),
        )
        return False


def insert_message(conn: sqlite3.Connection, msg: dict) -> bool:
    """Insert a message, returning True when newly inserted."""
    cursor = conn.execute(
        """
        INSERT OR IGNORE INTO messages (id, conversation_id, role, content,
                                        created_at, sequence, parent_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            msg["id"],
            msg["conversation_id"],
            msg["role"],
            msg["content"],
            msg["created_at"],
            msg.get("sequence"),
            msg.get("parent_id"),
            msg.get("metadata"),
        ),
    )
    return cursor.rowcount > 0


def insert_media_ref(conn: sqlite3.Connection, media: dict) -> bool:
    """Insert a media reference if it is not already present."""
    cursor = conn.execute(
        """
        INSERT INTO media_refs (message_id, media_type, original_path, filename, metadata)
        SELECT ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
            SELECT 1 FROM media_refs
            WHERE message_id = ?
              AND media_type = ?
              AND original_path = ?
              AND COALESCE(filename, '') = COALESCE(?, '')
        )
        """,
        (
            media["message_id"],
            media["media_type"],
            media["original_path"],
            media.get("filename"),
            media.get("metadata"),
            media["message_id"],
            media["media_type"],
            media["original_path"],
            media.get("filename"),
        ),
    )
    return cursor.rowcount > 0


def rebuild_fts_index(conn: sqlite3.Connection):
    """Rebuild the full-text search index from scratch."""
    in_transaction = conn.in_transaction
    try:
        if not in_transaction:
            conn.execute("BEGIN")
        conn.execute("DELETE FROM search_fts")

        # Index conversation titles
        conn.execute(
            """
            INSERT INTO search_fts (content, title, conversation_id, message_id, entry_type)
            SELECT title, title, id, NULL, 'conversation'
            FROM conversations
            WHERE title IS NOT NULL AND title != ''
            """
        )

        # Index messages
        conn.execute(
            """
            INSERT INTO search_fts (content, title, conversation_id, message_id, entry_type)
            SELECT m.content, c.title, m.conversation_id, m.id, 'message'
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.content IS NOT NULL AND m.content != ''
            """
        )

        if not in_transaction:
            conn.commit()
    except Exception:
        if not in_transaction:
            conn.rollback()
        raise


def purge_platform_data(conn: sqlite3.Connection, platform: str) -> dict:
    """Delete all data for a platform and return deletion counts."""
    conversations_deleted = conn.execute(
        "SELECT COUNT(*) FROM conversations WHERE platform = ?",
        (platform,),
    ).fetchone()[0]

    messages_deleted = conn.execute(
        """
        SELECT COUNT(*) FROM messages
        WHERE conversation_id IN (
            SELECT id FROM conversations WHERE platform = ?
        )
        """,
        (platform,),
    ).fetchone()[0]

    media_deleted = conn.execute(
        """
        SELECT COUNT(*) FROM media_refs
        WHERE message_id IN (
            SELECT id FROM messages
            WHERE conversation_id IN (
                SELECT id FROM conversations WHERE platform = ?
            )
        )
        """,
        (platform,),
    ).fetchone()[0]

    imports_deleted = conn.execute(
        "SELECT COUNT(*) FROM imports WHERE platform = ?",
        (platform,),
    ).fetchone()[0]

    conn.execute(
        """
        DELETE FROM media_refs
        WHERE message_id IN (
            SELECT id FROM messages
            WHERE conversation_id IN (
                SELECT id FROM conversations WHERE platform = ?
            )
        )
        """,
        (platform,),
    )
    conn.execute(
        """
        DELETE FROM messages
        WHERE conversation_id IN (
            SELECT id FROM conversations WHERE platform = ?
        )
        """,
        (platform,),
    )
    conn.execute(
        "DELETE FROM conversations WHERE platform = ?",
        (platform,),
    )
    conn.execute(
        "DELETE FROM imports WHERE platform = ?",
        (platform,),
    )

    return {
        "conversations_deleted": conversations_deleted,
        "messages_deleted": messages_deleted,
        "media_deleted": media_deleted,
        "imports_deleted": imports_deleted,
    }


def _build_search_filters(
    platform: str | None,
    role: str | None,
    before: str | None,
    attribute_ids: list[str] | None = None,
) -> tuple[str, list]:
    where_clauses = []
    params = []

    if attribute_ids is not None:
        where_clauses.append('c.id IN (SELECT value FROM json_each(?))')
        params.append(json.dumps(attribute_ids))

    if platform:
        where_clauses.append("c.platform = ?")
        params.append(platform)
    if role:
        where_clauses.append("m.role = ?")
        params.append(role)
    if before:
        where_clauses.append("COALESCE(m.created_at, c.created_at) <= ?")
        params.append(before)

    where_sql = ""
    if where_clauses:
        where_sql = "AND " + " AND ".join(where_clauses)

    return where_sql, params


def search(conn: sqlite3.Connection, query: str, limit: int = 50, offset: int = 0,
           platform: str = None, role: str = None, before: str = None,
           sort: str = 'relevance', attribute_ids: list[str] | None = None,
           group_by: str = 'date') -> list[dict]:
    """Search messages and conversation titles."""
    where_sql, filter_params = _build_search_filters(platform, role, before, attribute_ids)
    # A unique tie-breaker prevents duplicate/missing rows across pages.
    order = {
        'newest': 'COALESCE(m.created_at, c.created_at) DESC, s.rowid',
        'oldest': 'COALESCE(m.created_at, c.created_at) ASC, s.rowid',
    }.get(sort, 'rank, s.rowid')
    source_order = SOURCE_ORDER if group_by == 'source' else ''

    if query == MATCH_ALL_QUERY:
        params = [*filter_params, limit, offset]
        results = conn.execute(
            f"""
            SELECT
                s.conversation_id,
                s.message_id,
                s.entry_type,
                substr(s.content, 1, 160) as snippet,
                c.title as conversation_title,
                c.platform,
                c.created_at as conversation_date,
                m.role,
                m.content,
                m.created_at as message_date,
                0 as rank
            FROM search_fts s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN messages m ON s.message_id = m.id
            WHERE 1=1
            {where_sql}
            ORDER BY {source_order}{order if sort != 'relevance' else 'c.created_at DESC, s.rowid'}
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
    else:
        params = [query, *filter_params, limit, offset]
        results = conn.execute(
            f"""
            SELECT
                s.conversation_id,
                s.message_id,
                s.entry_type,
                snippet(search_fts, 0, '{HIGHLIGHT_START}', '{HIGHLIGHT_END}', '...', 32) as snippet,
                c.title as conversation_title,
                c.platform,
                c.created_at as conversation_date,
                m.role,
                m.content,
                m.created_at as message_date,
                bm25(search_fts) as rank
            FROM search_fts s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN messages m ON s.message_id = m.id
            WHERE search_fts MATCH ?
            {where_sql}
            ORDER BY {source_order}{order}
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()

    match_sql = '1=1' if query == MATCH_ALL_QUERY else 'search_fts MATCH ?'
    count_params = filter_params if query == MATCH_ALL_QUERY else [query, *filter_params]
    counts = {
        row['conversation_id']: row['matches'] for row in conn.execute(
            f'''SELECT s.conversation_id, COUNT(*) AS matches FROM search_fts s
                JOIN conversations c ON s.conversation_id = c.id
                LEFT JOIN messages m ON s.message_id = m.id
                WHERE {match_sql} {where_sql} GROUP BY s.conversation_id''', count_params
        )
    }
    attributes = conversation_attributes(conn, [r['conversation_id'] for r in results])
    return [{**dict(r), 'conversation_matches': counts[r['conversation_id']], 'attributes': attributes[r['conversation_id']]} for r in results]


def count_search_results(conn: sqlite3.Connection, query: str,
                         platform: str = None, role: str = None,
                         before: str = None, distinct_conversations: bool = False,
                         attribute_ids: list[str] | None = None) -> int:
    """Count total search results for pagination."""
    where_sql, filter_params = _build_search_filters(platform, role, before, attribute_ids)
    count = 'COUNT(DISTINCT s.conversation_id)' if distinct_conversations else 'COUNT(*)'

    if query == MATCH_ALL_QUERY:
        params = [*filter_params]
        result = conn.execute(
            f"""
            SELECT {count} as count
            FROM search_fts s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN messages m ON s.message_id = m.id
            WHERE 1=1
            {where_sql}
            """,
            params,
        ).fetchone()[0]
    else:
        params = [query, *filter_params]
        result = conn.execute(
            f"""
            SELECT {count} as count
            FROM search_fts s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN messages m ON s.message_id = m.id
            WHERE search_fts MATCH ?
            {where_sql}
            """,
            params,
        ).fetchone()[0]

    return result


def get_conversation(conn: sqlite3.Connection, conv_id: str) -> dict | None:
    """Get a conversation with all its messages."""
    conv = conn.execute(
        "SELECT * FROM conversations WHERE id = ?", (conv_id,)
    ).fetchone()

    if not conv:
        return None

    messages = conn.execute(
        """
        SELECT m.*,
               (SELECT json_group_array(json_object(
                   'id', mr.id,
                   'media_type', mr.media_type,
                   'original_path', mr.original_path,
                   'filename', mr.filename
               )) FROM media_refs mr WHERE mr.message_id = m.id) as media
        FROM messages m
        WHERE m.conversation_id = ?
        ORDER BY m.sequence, m.created_at
        """,
        (conv_id,),
    ).fetchall()

    return {
        **dict(conv),
        "attributes": conversation_attributes(conn, [conv_id])[conv_id],
        "messages": [dict(m) for m in messages],
    }


def list_conversations(conn: sqlite3.Connection, limit: int = 50, offset: int = 0,
                       platform: str = None, sort: str = 'newest',
                       attribute_ids: list[str] | None = None,
                       group_by: str = 'date') -> list[dict]:
    """List conversations with pagination."""
    where_sql, params = _build_search_filters(platform, None, None, attribute_ids)
    where_sql = 'WHERE 1=1 ' + where_sql

    params.extend([limit, offset])
    direction = 'ASC' if sort == 'oldest' else 'DESC'
    source_order = SOURCE_ORDER if group_by == 'source' else ''

    results = conn.execute(
        f"""
        SELECT c.*,
               (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
        FROM conversations c
        {where_sql}
        ORDER BY {source_order}c.created_at {direction}, c.id
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()

    attributes = conversation_attributes(conn, [r['id'] for r in results])
    return [{**dict(r), 'attributes': attributes[r['id']]} for r in results]


def conversation_neighbors(conn: sqlite3.Connection, conv_id: str, query: str = None,
                           platform: str = None, role: str = None, before: str = None,
                           sort: str = 'newest', attribute_ids: list[str] | None = None,
                           group_by: str = 'date') -> dict:
    """Follow the list's exact order, across pages, visiting each conversation once.

    Only IDs are read, not message bodies. Search uses the first matching hit in
    each conversation, just as the grouped result list does.
    """
    source_order = SOURCE_ORDER if group_by == 'source' else ''
    if query:
        where_sql, params = _build_search_filters(platform, role, before, attribute_ids)
        match_sql = '1=1' if query == MATCH_ALL_QUERY else 'search_fts MATCH ?'
        if query != MATCH_ALL_QUERY:
            params = [query, *params]
        order = {
            'newest': 'COALESCE(m.created_at, c.created_at) DESC, s.rowid',
            'oldest': 'COALESCE(m.created_at, c.created_at) ASC, s.rowid',
        }.get(sort, 'c.created_at DESC, s.rowid' if query == MATCH_ALL_QUERY else 'bm25(search_fts), s.rowid')
        rows = conn.execute(f'''SELECT s.conversation_id, s.message_id FROM search_fts s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN messages m ON s.message_id = m.id
            WHERE {match_sql} {where_sql} ORDER BY {source_order}{order}''', params)
    else:
        direction = 'ASC' if sort == 'oldest' else 'DESC'
        where_sql, params = _build_search_filters(platform, None, None, attribute_ids)
        rows = conn.execute(f'''SELECT id AS conversation_id, NULL AS message_id FROM conversations c
            WHERE 1=1 {where_sql} ORDER BY {source_order}created_at {direction}, id''', params)
    ordered = {}
    for row in rows:
        ordered.setdefault(row['conversation_id'], dict(row))
    ids = list(ordered)
    if conv_id not in ordered:
        return dict(previous=None, next=None, position=None, total=len(ids))
    index = ids.index(conv_id)
    return dict(previous=ordered[ids[index - 1]] if index else None,
                next=ordered[ids[index + 1]] if index + 1 < len(ids) else None,
                position=index + 1, total=len(ids))


def get_stats(conn: sqlite3.Connection) -> dict:
    """Get database statistics."""
    stats = {}

    stats["total_conversations"] = conn.execute(
        "SELECT COUNT(*) FROM conversations"
    ).fetchone()[0]

    stats["total_messages"] = conn.execute(
        "SELECT COUNT(*) FROM messages"
    ).fetchone()[0]

    stats["by_platform"] = {}
    for row in conn.execute(
        "SELECT platform, COUNT(*) as count FROM conversations GROUP BY platform"
    ):
        stats["by_platform"][row["platform"]] = row["count"]

    stats["imports"] = [
        dict(r) for r in conn.execute(
            "SELECT * FROM imports ORDER BY import_date DESC"
        ).fetchall()
    ]

    # Get most recent import date
    last_import = conn.execute(
        "SELECT MAX(import_date) FROM imports"
    ).fetchone()[0]
    stats["last_imported"] = last_import

    return stats
