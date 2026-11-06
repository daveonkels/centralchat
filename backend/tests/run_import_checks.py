"""Run import regressions without installing development packages on production."""
import inspect
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import test_imports
from test_import_reliability import ImportReliabilityTests

suite = unittest.defaultTestLoader.loadTestsFromTestCase(ImportReliabilityTests)
for name, fn in inspect.getmembers(test_imports, inspect.isfunction):
    if name.startswith('test_'):
        def check(fn=fn):
            with tempfile.TemporaryDirectory() as folder:
                fn(Path(folder))
        suite.addTest(unittest.FunctionTestCase(check, description=name))
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())
