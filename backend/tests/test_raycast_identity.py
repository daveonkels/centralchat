"""Raycast re-export regressions using the real importer and isolated SQLite."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import database
from app.parsers.raycast import RaycastParser
from app.routers.imports import import_export


def session(title='Original title', index=0, texts=('Hello', 'Hello back'), date='2026-01-01'):
    return dict(title=title, index=index, date=date, messages=[
        dict(role='user' if i % 2 == 0 else 'assistant', content=text)
        for i, text in enumerate(texts)
    ])


class RaycastIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patch = patch.object(database, 'DATABASE_PATH', str(self.root / 'test.db'))
        self.patch.start()
        database.init_db()
        self.n = 0

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def export(self, sessions, timestamp=None):
        self.n += 1
        folder = self.root / str(self.n)
        folder.mkdir()
        (folder / 'raycast_ai_chats.json').write_text(json.dumps(dict(
            exported_at=timestamp or f'2026-02-{self.n:02d}T12:00:00', sessions=sessions
        )))
        return folder

    def run_import(self, sessions, timestamp=None):
        result = import_export(self.export(sessions, timestamp), 'raycast')
        self.assertEqual(result.status, 'completed', result.errors)
        return result

    def snapshot(self):
        with database.get_connection() as conn:
            return (
                [dict(r) for r in conn.execute('SELECT * FROM conversations ORDER BY id')],
                [dict(r) for r in conn.execute('SELECT * FROM messages ORDER BY conversation_id, sequence')],
            )

    def test_fresh_export_renamed_reordered_redated_chat_appends_and_keeps_ids(self):
        self.run_import([session(), session('Other', 1, ('Different', 'Answer'))])
        before, old_messages = self.snapshot()
        result = self.run_import([
            session('Other', 0, ('Different', 'Answer')),
            session('Renamed', 7, ('Hello', 'Hello back', 'More', 'New searchable answer'), '2026-01-30'),
        ])
        self.assertEqual((result.conversations_imported, result.messages_imported, result.errors), (0, 2, []))
        after, messages = self.snapshot()
        self.assertEqual([c['id'] for c in before], [c['id'] for c in after])
        self.assertTrue({m['id'] for m in old_messages} <= {m['id'] for m in messages})
        self.assertEqual({c['id']: c['created_at'] for c in before}, {c['id']: c['created_at'] for c in after})
        self.assertIn('Renamed', [c['title'] for c in after])
        with database.get_connection() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM search_fts WHERE search_fts MATCH 'searchable'").fetchone()[0], 1)

    def test_legacy_archive_is_reused_without_migration_or_new_message_ids(self):
        folder = self.export([session()])
        conv = next(RaycastParser.parse(folder))
        conv.metadata = json.dumps({'original_index': 0})
        with database.get_connection() as conn:
            database.insert_conversation(conn, conv.to_dict())
            for msg in conv.messages:
                database.insert_message(conn, msg.to_dict())
            conn.commit()
        old_id = conv.id
        result = self.run_import([session(index=17, texts=('Hello', 'Hello back', 'Follow-up'))])
        self.assertEqual((result.conversations_imported, result.messages_imported), (0, 1))
        self.assertEqual(self.snapshot()[0][0]['id'], old_id)

    def test_old_and_shorter_snapshots_do_not_erase_messages_or_restore_old_title(self):
        old = self.export([session()])
        import_export(old, 'raycast')
        self.run_import([session('New title', texts=('Hello', 'Hello back', 'Next', 'Reply'))])
        for folder in [old, self.export([session('Stale title')])]:
            result = import_export(folder, 'raycast')
            self.assertEqual((result.conversations_imported, result.messages_imported), (0, 0))
        convs, messages = self.snapshot()
        self.assertEqual((convs[0]['title'], len(messages)), ('New title', 4))

    def test_alias_replay_and_same_length_older_export_preserve_current_title(self):
        self.run_import([session()])
        old_alias = self.export([session('Second title')])
        import_export(old_alias, 'raycast')
        self.run_import([session('Latest title')])
        result = import_export(old_alias, 'raycast')
        self.assertEqual((result.conversations_imported, result.messages_imported), (0, 0))
        self.assertEqual(self.snapshot()[0][0]['title'], 'Latest title')

    def test_same_title_and_opening_prompt_do_not_merge_distinct_answers(self):
        self.run_import([session(texts=('Hello', 'Answer A'))])
        result = self.run_import([session(texts=('Hello', 'Answer B'))])
        self.assertEqual((result.conversations_imported, result.messages_imported), (1, 2))
        self.assertEqual(len(self.snapshot()[0]), 2)

    def test_repeated_message_text_keeps_each_occurrence(self):
        self.run_import([session()])
        result = self.run_import([session(texts=('Hello', 'Hello back', 'Hello', 'Hello back'))])
        self.assertEqual(result.messages_imported, 2)
        self.assertEqual(len(self.snapshot()[1]), 4)

    def test_multiple_archive_candidates_are_reported_without_changes(self):
        self.run_import([session('A', 0), session('B', 1)])
        before = self.snapshot()
        result = self.run_import([session('Renamed', 0)])
        self.assertEqual((result.conversations_imported, result.messages_imported), (0, 0))
        self.assertIn('ambiguous', result.errors[0])
        self.assertEqual(before, self.snapshot())

    def test_exact_history_takes_precedence_over_other_prefix_histories(self):
        sessions = [session('Short', 0), session('Long', 1, ('Hello', 'Hello back', 'More', 'Reply'))]
        self.run_import(sessions)
        before = self.snapshot()
        result = self.run_import(sessions)
        self.assertEqual((result.conversations_imported, result.messages_imported, result.errors), (0, 0, []))
        self.assertEqual([c['id'] for c in before[0]], [c['id'] for c in self.snapshot()[0]])

    def test_two_incoming_chats_cannot_both_claim_one_existing_chat(self):
        self.run_import([session()])
        result = self.run_import([session('A', 0), session('B', 1, ('Hello', 'Hello back', 'More'))])
        self.assertEqual((result.conversations_imported, result.messages_imported, len(result.errors)), (0, 0, 2))
        self.assertEqual(len(self.snapshot()[1]), 2)

    def test_empty_and_single_message_overlap_are_not_guessed(self):
        self.run_import([session(texts=('Hello',))])
        result = self.run_import([session(texts=('Hello', 'Hello back')), session('Empty', 1, ())])
        self.assertEqual((result.conversations_imported, result.messages_imported, len(result.errors)), (0, 0, 2))

    def test_modified_snapshot_does_not_silently_discard_changed_content(self):
        folder = self.export([session()])
        import_export(folder, 'raycast')
        path = folder / 'raycast_ai_chats.json'
        data = json.loads(path.read_text())
        data['sessions'][0]['messages'][1]['content'] = 'Edited response'
        path.write_text(json.dumps(data))
        result = import_export(folder, 'raycast')
        self.assertIn('different message content', result.errors[0])
        self.assertEqual(self.snapshot()[1][1]['content'], 'Hello back')

    def test_aliases_are_removed_by_platform_purge(self):
        self.run_import([session()])
        with database.get_connection() as conn:
            database.purge_platform_data(conn, 'raycast')
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM raycast_import_aliases').fetchone()[0], 0)

    def test_failed_import_rolls_back_aliases_and_messages(self):
        self.run_import([session()])
        before = self.snapshot()
        folder = self.export([session(texts=('Hello', 'Hello back', 'More'))])
        with patch('app.routers.imports.insert_message', side_effect=RuntimeError('disk full')):
            result = import_export(folder, 'raycast')
        self.assertEqual(result.status, 'error')
        self.assertEqual(before, self.snapshot())
        with database.get_connection() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM raycast_import_aliases').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
