from app.routers import imports


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
