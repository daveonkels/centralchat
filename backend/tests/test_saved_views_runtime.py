"""Run in the existing backend runtime; uses no extra test dependencies."""
import copy
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_saved_views import CONFIG

try:
    from pydantic import ValidationError
    from app.saved_views_models import CreateSavedView, UpdateSavedView
except ImportError:
    raise unittest.SkipTest('Run saved-view runtime checks in the existing backend image with FastAPI/Pydantic.')


class SavedViewValidationTests(unittest.TestCase):
    def test_config_rejects_invalid_types_unknown_fields_and_invalid_dates(self):
        for field, value in [('query', 12), ('query', 'x' * 2001), ('platform', 'unknown'),
                             ('role', 'owner'), ('attribute', 'documents'), ('sort', 'name'),
                             ('before', '2025-02-29'), ('before', '20250101'), ('extra', 'ignored')]:
            config = copy.deepcopy(CONFIG)
            config[field] = value
            with self.subTest(field=field, value=str(value)[:30]), self.assertRaises(ValidationError):
                CreateSavedView.model_validate({'name': 'Valid name', 'config': config})
        for field, value in [('showSource', 'false'), ('groupBy', 'unknown'), ('density', 'dense')]:
            config = copy.deepcopy(CONFIG)
            config['display'][field] = value
            with self.subTest(field=field), self.assertRaises(ValidationError):
                CreateSavedView.model_validate({'name': 'Valid name', 'config': config})

    def test_names_and_partial_updates_are_validated(self):
        for name in ('', '   ', 'x' * 81):
            with self.assertRaises(ValidationError):
                CreateSavedView.model_validate({'name': name, 'config': CONFIG})
        self.assertEqual(CreateSavedView.model_validate({'name': '  My view  ', 'config': CONFIG}).name, 'My view')
        for patch in ({}, {'name': None}, {'config': None}, {'name': '  '}, {'name': 'View', 'unknown': True}):
            with self.assertRaises(ValidationError):
                UpdateSavedView.model_validate(patch)
        self.assertEqual(UpdateSavedView.model_validate({'name': 'Renamed'}).name, 'Renamed')
        self.assertEqual(UpdateSavedView.model_validate({'config': CONFIG}).config.model_dump(), CONFIG)


class SavedViewsHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.database = Path(cls.folder.name) / 'archive.db'
        with socket.socket() as reserved:
            reserved.bind(('127.0.0.1', 0))
            cls.port = reserved.getsockname()[1]
        cls.base = f'http://127.0.0.1:{cls.port}'
        cls.environment = dict(os.environ, DATABASE_PATH=str(cls.database), IMPORTS_PATH=str(Path(cls.folder.name) / 'imports'))
        cls.start_server()

    @classmethod
    def start_server(cls):
        cls.child = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(cls.port)],
            env=cls.environment, cwd=Path(__file__).resolve().parents[1],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        for _ in range(100):
            if cls.child.poll() is not None:
                raise AssertionError(cls.child.stderr.read(4000).decode())
            try:
                with urllib.request.urlopen(cls.base + '/api/health', timeout=1) as response:
                    if response.status == 200:
                        return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(.05)
        cls.stop_server()
        raise AssertionError('Test API did not become ready')

    @classmethod
    def stop_server(cls):
        cls.child.terminate()
        cls.child.wait(timeout=10)
        cls.child.stderr.close()

    @classmethod
    def tearDownClass(cls):
        cls.stop_server()
        cls.folder.cleanup()

    def request(self, route, method='GET', payload=None):
        request = urllib.request.Request(self.base + route, method=method,
                                         data=json.dumps(payload).encode() if payload is not None else None,
                                         headers={'Content-Type': 'application/json'})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            return response.status, json.loads(body) if body else None

    def tearDown(self):
        for view in self.request('/api/views')[1]:
            self.request('/api/views/' + view['id'], 'DELETE')

    def test_crud_round_trip_persists_across_server_restart(self):
        status, created = self.request('/api/views', 'POST', {'name': 'Claude code', 'config': CONFIG})
        self.assertEqual(status, 201)
        self.assertEqual(created['config'], CONFIG)
        route = '/api/views/' + created['id']
        replacement = {**CONFIG, 'query': 'coffee', 'attribute': 'images'}
        status, updated = self.request(route, 'PATCH', {'name': 'Coffee images', 'config': replacement})
        self.assertEqual(status, 200)
        self.assertEqual(updated['created_at'], created['created_at'])
        type(self).stop_server()
        type(self).start_server()
        self.assertEqual(self.request('/api/views'), (200, [updated]))
        self.assertEqual(self.request(route, 'DELETE'), (204, None))
        self.assertEqual(self.request(route, 'DELETE')[0], 404)
        self.assertEqual(self.request(route, 'PATCH', {'name': 'Missing'})[0], 404)

    def test_duplicate_names_and_invalid_payloads_return_clear_status(self):
        self.assertEqual(self.request('/api/views', 'POST', {'name': 'Coffee', 'config': CONFIG})[0], 201)
        status, error = self.request('/api/views', 'POST', {'name': 'coffee', 'config': CONFIG})
        self.assertEqual(status, 409)
        self.assertIn('already exists', error['detail'])
        for payload in ({'name': 'Missing config'}, {'name': '  ', 'config': CONFIG},
                        {'name': 'Bad config', 'config': {**CONFIG, 'role': 'invalid'}}):
            self.assertEqual(self.request('/api/views', 'POST', payload)[0], 422)

    def test_grouping_parameters_are_validated_on_every_read_route(self):
        for route in ('/api/conversations?group_by=invalid', '/api/search?q=coffee&group_by=invalid',
                      '/api/conversations/missing/neighbors?group_by=invalid'):
            self.assertEqual(self.request(route)[0], 422)
        for group in ('source', 'date', 'none'):
            self.assertEqual(self.request('/api/conversations?group_by=' + group)[0], 200)


if __name__ == '__main__':
    unittest.main()
