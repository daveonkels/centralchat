from app.routers import imports
from app import database


def write_claude_export(path, messages):
    path.mkdir(parents=True, exist_ok=True)
    (path / "conversations.json").write_text(
        """
[
  {
    "uuid": "claude-conv-1",
    "name": "Test Claude chat",
    "created_at": "2026-05-30T00:00:00",
    "updated_at": "2026-05-31T00:00:00",
    "chat_messages": %s
  }
]
        """ % messages,
        encoding="utf-8",
    )


def test_resolve_import_folder_allows_child(tmp_path):
    imports_dir = tmp_path / "imports"
    imports_dir.mkdir()
    (imports_dir / "valid").mkdir()

    original = imports.IMPORTS_PATH
    imports.IMPORTS_PATH = str(imports_dir)
    try:
        resolved = imports.resolve_import_folder("valid")
    finally:
        imports.IMPORTS_PATH = original

    assert resolved == (imports_dir / "valid").resolve()


def test_resolve_import_folder_blocks_traversal(tmp_path):
    imports_dir = tmp_path / "imports"
    imports_dir.mkdir()
    outside_dir = tmp_path / "outside"
    outside_dir.mkdir()

    original = imports.IMPORTS_PATH
    imports.IMPORTS_PATH = str(imports_dir)
    try:
        resolved = imports.resolve_import_folder("../outside")
    finally:
        imports.IMPORTS_PATH = original

    assert resolved is None


def test_resolve_import_folder_returns_path_even_if_missing(tmp_path):
    imports_dir = tmp_path / "imports"
    imports_dir.mkdir()

    original = imports.IMPORTS_PATH
    imports.IMPORTS_PATH = str(imports_dir)
    try:
        resolved = imports.resolve_import_folder("missing")
    finally:
        imports.IMPORTS_PATH = original

    assert resolved == (imports_dir / "missing").resolve()


def test_scan_detects_renamed_claude_json_file(tmp_path):
    imports_dir = tmp_path / "imports"
    folder = imports_dir / "claude-05312026"
    folder.mkdir(parents=True)
    (folder / "claude-conversations-053126.json").write_text(
        """
[
  {
    "uuid": "claude-conv-1",
    "name": "Renamed Claude export",
    "created_at": "2026-05-30T00:00:00",
    "updated_at": "2026-05-31T00:00:00",
    "chat_messages": []
  }
]
        """,
        encoding="utf-8",
    )

    original = imports.IMPORTS_PATH
    imports.IMPORTS_PATH = str(imports_dir)
    try:
        result = imports.scan_imports()
    finally:
        imports.IMPORTS_PATH = original

    assert result.detected_exports == [
        {
            "path": str(folder),
            "name": "claude-05312026",
            "platform": "claude",
        }
    ]
    assert result.skipped_exports == []


def test_scan_reports_skipped_folder_reason(tmp_path):
    imports_dir = tmp_path / "imports"
    folder = imports_dir / "notes"
    folder.mkdir(parents=True)
    (folder / "readme.txt").write_text("not an export", encoding="utf-8")

    original = imports.IMPORTS_PATH
    imports.IMPORTS_PATH = str(imports_dir)
    try:
        result = imports.scan_imports()
    finally:
        imports.IMPORTS_PATH = original

    assert result.detected_exports == []
    assert result.skipped_exports == [
        {
            "path": str(folder),
            "name": "notes",
            "reason": "No JSON export files found in the folder root",
        }
    ]


def test_reimport_merges_new_messages_for_existing_conversation(tmp_path):
    db_path = tmp_path / "central-chat.db"
    first_export = tmp_path / "first"
    second_export = tmp_path / "second"

    write_claude_export(
        first_export,
        """[
          {
            "uuid": "msg-1",
            "sender": "human",
            "text": "hello",
            "created_at": "2026-05-30T00:00:00"
          }
        ]""",
    )
    write_claude_export(
        second_export,
        """[
          {
            "uuid": "msg-1",
            "sender": "human",
            "text": "hello",
            "created_at": "2026-05-30T00:00:00"
          },
          {
            "uuid": "msg-2",
            "sender": "assistant",
            "text": "hi there",
            "created_at": "2026-05-31T00:00:00"
          }
        ]""",
    )

    original_db_path = database.DATABASE_PATH
    database.DATABASE_PATH = str(db_path)
    try:
        database.init_db()
        first_status = imports.import_export(first_export, "claude", rebuild_fts=False)
        second_status = imports.import_export(second_export, "claude", rebuild_fts=False)

        with database.get_connection() as conn:
            message_count = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    finally:
        database.DATABASE_PATH = original_db_path

    assert first_status.conversations_imported == 1
    assert first_status.messages_imported == 1
    assert second_status.conversations_imported == 0
    assert second_status.messages_imported == 1
    assert message_count == 2
