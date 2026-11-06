"""Persistence and grouping regressions using only SQLite and unittest."""
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import SCHEMA, MATCH_ALL_QUERY, conversation_neighbors, list_conversations, search
from app.saved_views import SavedViewConflict, create_saved_view, delete_saved_view, list_saved_views, update_saved_view


CONFIG = {
    'query': 'espresso platform:claude', 'platform': None, 'role': '', 'before': '',
    'attribute': 'code', 'sort': 'relevance',
    'display': {'density': 'compact', 'groupBy': 'source', 'showSource': True,
                'showDate': False, 'showCount': True, 'showContent': True, 'showPreview': True},
}


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


class SavedViewsStorageTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'archive.db'
        self.conn = connect(self.path)
        self.conn.executescript(SCHEMA)
        self.conn.execute("INSERT INTO conversations (id,platform,title,created_at) VALUES ('original','openai','Preserved','2026-01-01')")
        self.conn.commit()

    def tearDown(self):
        self.conn.close()
        self.folder.cleanup()

    def test_full_view_survives_reopen_and_schema_initialization(self):
        expected = create_saved_view(self.conn, 'Claude code', CONFIG)
        self.conn.close()
        self.conn = connect(self.path)
        self.conn.executescript(SCHEMA)
        self.assertEqual(list_saved_views(self.conn), [expected])
        self.assertEqual(self.conn.execute('SELECT title FROM conversations').fetchone()[0], 'Preserved')

    def test_rename_update_and_remove_leave_archive_untouched(self):
        view = create_saved_view(self.conn, 'Original', CONFIG)
        before = tuple(self.conn.execute('SELECT * FROM conversations').fetchone())
        changed = update_saved_view(self.conn, view['id'], name='Renamed')
        self.assertEqual(changed['config'], CONFIG)
        self.assertEqual(changed['created_at'], view['created_at'])
        replacement = {**CONFIG, 'attribute': 'images', 'query': ''}
        changed = update_saved_view(self.conn, view['id'], config=replacement)
        self.assertEqual((changed['name'], changed['config']), ('Renamed', replacement))
        self.assertTrue(delete_saved_view(self.conn, view['id']))
        self.assertEqual(list_saved_views(self.conn), [])
        self.assertEqual(tuple(self.conn.execute('SELECT * FROM conversations').fetchone()), before)

    def test_duplicate_rename_is_atomic(self):
        first = create_saved_view(self.conn, 'First', CONFIG)
        second = create_saved_view(self.conn, 'Second', CONFIG)
        with self.assertRaises(SavedViewConflict):
            create_saved_view(self.conn, 'FIRST', CONFIG)
        with self.assertRaises(SavedViewConflict):
            update_saved_view(self.conn, second['id'], name='first', config={**CONFIG, 'attribute': 'images'})
        self.assertEqual(list_saved_views(self.conn), [first, second])

    def test_missing_id_and_sql_metacharacters_are_safe(self):
        view = create_saved_view(self.conn, "Notes'); DROP TABLE conversations; --", CONFIG)
        self.assertIsNone(update_saved_view(self.conn, 'missing', name='Not created'))
        self.assertFalse(delete_saved_view(self.conn, "' OR 1=1 --"))
        self.assertEqual(list_saved_views(self.conn), [view])

    def test_concurrent_creates_enforce_workspace_limit(self):
        for i in range(99):
            create_saved_view(self.conn, f'View {i}', CONFIG)
        barrier = threading.Barrier(2)
        outcomes = []

        def create(name):
            conn = connect(self.path)
            try:
                barrier.wait()
                create_saved_view(conn, name, CONFIG)
                outcomes.append('created')
            except SavedViewConflict:
                outcomes.append('full')
            finally:
                conn.close()

        threads = [threading.Thread(target=create, args=(f'Concurrent {i}',)) for i in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
            self.assertFalse(thread.is_alive())
        self.assertCountEqual(outcomes, ['created', 'full'])
        self.assertEqual(len(list_saved_views(self.conn)), 100)


class SourceGroupingTests(unittest.TestCase):
    def setUp(self):
        self.conn = connect(':memory:')
        self.conn.executescript(SCHEMA)
        for i in range(75):
            cid = f'c{i:03}'
            platform = ('raycast', 'claude', 'openai')[i % 3]
            date = f'2025-01-{(i % 28) + 1:02}T12:00:00'
            self.conn.execute('INSERT INTO conversations (id,platform,title,created_at) VALUES (?,?,?,?)', (cid, platform, 'Coffee notes', date))
            self.conn.execute('INSERT INTO messages (id,conversation_id,role,content,created_at) VALUES (?,?,?,?,?)', (cid + '-m', cid, 'user', 'coffee recipe', date))
            self.conn.execute('INSERT INTO search_fts (content,title,conversation_id,message_id,entry_type) VALUES (?,?,?,?,?)', ('coffee recipe', 'Coffee notes', cid, cid + '-m', 'message'))

    def tearDown(self):
        self.conn.close()

    def test_source_order_is_global_across_pages_and_neighbors(self):
        for sort in ('newest', 'oldest'):
            rows = [r for offset in (0, 20, 40, 60) for r in list_conversations(self.conn, limit=20, offset=offset, sort=sort, group_by='source')]
            self.assertEqual([r['platform'] for r in rows], ['openai'] * 25 + ['claude'] * 25 + ['raycast'] * 25)
            self.assertEqual(len({r['id'] for r in rows}), 75)
            for index in (0, 24, 25, 49, 50, 74):
                neighbors = conversation_neighbors(self.conn, rows[index]['id'], sort=sort, group_by='source')
                self.assertEqual(neighbors['position'], index + 1)
                self.assertEqual(neighbors['next']['conversation_id'] if neighbors['next'] else None, rows[index + 1]['id'] if index < 74 else None)

    def test_search_and_match_all_grouping_follow_same_neighbor_order(self):
        for query in ('coffee', MATCH_ALL_QUERY):
            for sort in ('relevance', 'newest', 'oldest'):
                rows = [r for offset in (0, 20, 40, 60) for r in search(self.conn, query, limit=20, offset=offset, sort=sort, group_by='source')]
                self.assertEqual([r['platform'] for r in rows], ['openai'] * 25 + ['claude'] * 25 + ['raycast'] * 25)
                for index in (24, 49):
                    neighbors = conversation_neighbors(self.conn, rows[index]['conversation_id'], query=query, sort=sort, group_by='source')
                    self.assertEqual(neighbors['next']['conversation_id'], rows[index + 1]['conversation_id'])
                    self.assertEqual(neighbors['total'], 75)

    def test_date_none_and_unknown_grouping_do_not_reorder_or_inject(self):
        base = list_conversations(self.conn, limit=100)
        for group in ('date', 'none', "source; DROP TABLE conversations"):
            self.assertEqual(list_conversations(self.conn, limit=100, group_by=group), base)
        rows = list_conversations(self.conn, platform='claude', attribute_ids=['c001', 'c004'], group_by='source')
        self.assertEqual({r['id'] for r in rows}, {'c001', 'c004'})


if __name__ == '__main__':
    unittest.main()
