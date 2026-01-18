import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DATABASE_PATH = os.environ.get("DATABASE_PATH", "/app/data/central-chat.db")

SCHEMA = """
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
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


@contextmanager
def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def insert_conversation(conn: sqlite3.Connection, conv: dict) -> bool:
    """Insert a conversation, returns True if inserted (not duplicate)."""
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
        return False


def insert_message(conn: sqlite3.Connection, msg: dict):
    """Insert a message."""
    conn.execute(
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


def insert_media_ref(conn: sqlite3.Connection, media: dict):
    """Insert a media reference."""
    conn.execute(
        """
        INSERT INTO media_refs (message_id, media_type, original_path, filename, metadata)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            media["message_id"],
            media["media_type"],
            media["original_path"],
            media.get("filename"),
            media.get("metadata"),
        ),
    )


def rebuild_fts_index(conn: sqlite3.Connection):
    """Rebuild the full-text search index from scratch."""
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

    conn.commit()


def search(conn: sqlite3.Connection, query: str, limit: int = 50, offset: int = 0,
           platform: str = None, role: str = None) -> list[dict]:
    """Search messages and conversation titles."""
    params = [query]

    where_clauses = []
    if platform:
        where_clauses.append("c.platform = ?")
        params.append(platform)
    if role:
        where_clauses.append("m.role = ?")
        params.append(role)

    where_sql = ""
    if where_clauses:
        where_sql = "AND " + " AND ".join(where_clauses)

    params.extend([limit, offset])

    results = conn.execute(
        f"""
        SELECT
            s.conversation_id,
            s.message_id,
            s.entry_type,
            snippet(search_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
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
        ORDER BY rank
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()

    return [dict(r) for r in results]


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
        "messages": [dict(m) for m in messages],
    }


def list_conversations(conn: sqlite3.Connection, limit: int = 50, offset: int = 0,
                       platform: str = None) -> list[dict]:
    """List conversations with pagination."""
    params = []
    where_sql = ""

    if platform:
        where_sql = "WHERE platform = ?"
        params.append(platform)

    params.extend([limit, offset])

    results = conn.execute(
        f"""
        SELECT c.*,
               (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count
        FROM conversations c
        {where_sql}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()

    return [dict(r) for r in results]


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

    return stats
