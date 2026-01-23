import pytest
from fastapi import HTTPException

from app.routers.search import normalize_before


def test_normalize_before_none():
    assert normalize_before(None) is None


def test_normalize_before_date_only():
    assert normalize_before("2024-01-01") == "2024-01-01T23:59:59"


def test_normalize_before_datetime_with_space():
    assert normalize_before("2024-01-01 12:30:00") == "2024-01-01T12:30:00"


def test_normalize_before_datetime_iso():
    assert normalize_before("2024-01-01T12:30:00") == "2024-01-01T12:30:00"


def test_normalize_before_invalid():
    with pytest.raises(HTTPException) as exc:
        normalize_before("not-a-date")
    assert exc.value.status_code == 400
