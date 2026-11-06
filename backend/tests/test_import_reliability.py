"""Regression checks runnable with the production runtime and stdlib unittest."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from app import database
from app.routers import imports
from test_imports import write_openai_split_export


class ImportReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.patches = [
            patch.object(imports, 'IMPORTS_PATH', str(self.root / 'imports')),
            patch.object(database, 'DATABASE_PATH', str(self.root / 'test.db')),
            patch.object(imports, 'IMPORT_JOBS', {}),
        ]
        for item in self.patches:
            item.start()
        database.init_db()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def test_nested_split_export_scan_matches_run(self):
        folder = self.root / 'imports' / 'download' / 'nested' / 'export'
        write_openai_split_export(folder)
        scan = imports.scan_imports()
        self.assertEqual(len(scan.detected_exports), 1)
        self.assertEqual(scan.detected_exports[0]['file_count'], 2)
        self.assertEqual(scan.detected_exports[0]['name'], 'download/nested/export')
        self.assertFalse(scan.skipped_exports)
        tasks = BackgroundTasks()
        result = imports.run_import(tasks)
        self.assertEqual([s.source_path for s in result.statuses], [str(folder)])
        task = tasks.tasks[0]
        task.func(*task.args, **task.kwargs)
        final = imports.get_job_snapshot(result.job_id)
        self.assertTrue(final.completed)
        self.assertEqual(final.statuses[0].messages_imported, 2)

    def test_split_files_directly_in_imports_root(self):
        write_openai_split_export(self.root / 'imports')
        scan = imports.scan_imports()
        self.assertEqual(scan.detected_exports[0]['name'], '.')
        self.assertEqual(scan.detected_exports[0]['file_count'], 2)

    def test_missing_mount_is_actionable(self):
        self.assertTrue(imports.scan_imports().errors)
        with self.assertRaises(HTTPException) as error:
            imports.run_import(BackgroundTasks())
        self.assertEqual(error.exception.status_code, 400)

    def test_bad_shard_is_not_silently_ignored(self):
        folder = self.root / 'imports' / 'export'
        write_openai_split_export(folder)
        (folder / 'conversations-002.json').write_text('[unfinished')
        scan = imports.scan_imports()
        self.assertFalse(scan.detected_exports)
        self.assertIn('conversations-002.json', scan.skipped_exports[0]['reason'])
        result = imports.import_export(folder, 'openai')
        self.assertEqual(result.status, 'error')
        with database.get_connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) FROM conversations').fetchone()[0], 0)

    def test_malformed_sidecar_does_not_break_detection(self):
        folder = self.root / 'imports' / 'export'
        write_openai_split_export(folder)
        (folder / 'other.json').write_text('[7]')
        self.assertEqual(imports.scan_imports().detected_exports[0]['file_count'], 2)

    def test_symlink_cannot_escape_imports(self):
        write_openai_split_export(self.root / 'outside')
        (self.root / 'imports').mkdir()
        (self.root / 'imports' / 'linked').symlink_to(self.root / 'outside', target_is_directory=True)
        self.assertFalse(imports.scan_imports().detected_exports)
        self.assertTrue(imports.scan_imports().skipped_exports)

    def test_concurrent_import_rejected_and_job_can_reconnect(self):
        write_openai_split_export(self.root / 'imports' / 'export')
        first = imports.run_import(BackgroundTasks())
        self.assertEqual(imports.active_import().job_id, first.job_id)
        with self.assertRaises(HTTPException) as error:
            imports.run_import(BackgroundTasks())
        self.assertEqual(error.exception.status_code, 409)

    def test_index_failure_ends_job_with_error(self):
        folder = self.root / 'imports' / 'export'
        write_openai_split_export(folder)
        tasks = BackgroundTasks()
        result = imports.run_import(tasks)
        task = tasks.tasks[0]
        with patch.object(imports, 'rebuild_fts_index', side_effect=RuntimeError('disk full')):
            task.func(*task.args, **task.kwargs)
        final = imports.get_job_snapshot(result.job_id)
        self.assertTrue(final.completed)
        self.assertEqual(final.statuses[0].status, 'error')
        self.assertIn('search indexing failed', final.statuses[0].errors[0])

    def test_nested_zip_export_finds_all_parts(self):
        folder = self.root / 'extracted' / 'wrapper' / 'account' / 'export'
        write_openai_split_export(folder)
        self.assertEqual(imports._find_export_folder(self.root / 'extracted'), (folder, 'openai'))


if __name__ == '__main__':
    unittest.main()
