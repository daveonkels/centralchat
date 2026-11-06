"""SQLite storage for saved views, independent of archive imports and purges."""
import json
import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

MAX_SAVED_VIEWS = 100


class SavedViewConflict(ValueError):
    pass


def _view(row) -> dict:
    result = dict(row)
    result['config'] = json.loads(result['config'])
    return result


def list_saved_views(conn: sqlite3.Connection) -> list[dict]:
    return [_view(row) for row in conn.execute(
        'SELECT * FROM saved_views ORDER BY name COLLATE NOCASE, created_at, id'
    )]


def create_saved_view(conn: sqlite3.Connection, name: str, config: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    identifier = str(uuid4())
    try:
        with conn:
            # Serialize the count and insert so simultaneous requests cannot
            # exceed the workspace limit.
            conn.execute('BEGIN IMMEDIATE')
            if conn.execute('SELECT COUNT(*) FROM saved_views').fetchone()[0] >= MAX_SAVED_VIEWS:
                raise SavedViewConflict('You can save up to 100 views. Remove an unused view first.')
            conn.execute('INSERT INTO saved_views (id,name,config,created_at,updated_at) VALUES (?,?,?,?,?)',
                         (identifier, name, json.dumps(config), now, now))
    except sqlite3.IntegrityError as exc:
        raise SavedViewConflict('A view with this name already exists. Choose another name.') from exc
    return _view(conn.execute('SELECT * FROM saved_views WHERE id = ?', (identifier,)).fetchone())


def update_saved_view(conn: sqlite3.Connection, identifier: str, *, name: str | None = None,
                      config: dict | None = None) -> dict | None:
    fields = ['updated_at = ?']
    values = [datetime.now(timezone.utc).isoformat()]
    if name is not None:
        fields.append('name = ?')
        values.append(name)
    if config is not None:
        fields.append('config = ?')
        values.append(json.dumps(config))
    try:
        with conn:
            changed = conn.execute(f'UPDATE saved_views SET {", ".join(fields)} WHERE id = ?',
                                   [*values, identifier]).rowcount
    except sqlite3.IntegrityError as exc:
        raise SavedViewConflict('A view with this name already exists. Choose another name.') from exc
    if not changed:
        return None
    return _view(conn.execute('SELECT * FROM saved_views WHERE id = ?', (identifier,)).fetchone())


def delete_saved_view(conn: sqlite3.Connection, identifier: str) -> bool:
    with conn:
        return bool(conn.execute('DELETE FROM saved_views WHERE id = ?', (identifier,)).rowcount)
