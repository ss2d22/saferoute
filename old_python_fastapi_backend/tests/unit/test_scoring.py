"""Unit tests for scoring utilities."""

from datetime import date, datetime

import pytest

from app.utils.scoring import (
    calculate_months_ago,
    get_recency_weight,
    get_time_bucket,
    get_time_weight,
    normalize_score,
    risk_to_safety_score,
)


def test_get_recency_weight():
    """Test recency weight calculation."""
    assert get_recency_weight(0) == 1.0
    assert get_recency_weight(2) == 1.0
    assert get_recency_weight(3) == 1.0
    assert get_recency_weight(4) == 0.75
    assert get_recency_weight(6) == 0.75
    assert get_recency_weight(7) == 0.5
    assert get_recency_weight(12) == 0.5
    assert get_recency_weight(13) == 0.25
    assert get_recency_weight(24) == 0.25


def test_get_time_bucket():
    """Test time bucket classification."""
    assert get_time_bucket(datetime(2025, 1, 1, 0, 0)) == "night"
    assert get_time_bucket(datetime(2025, 1, 1, 3, 30)) == "night"
    assert get_time_bucket(datetime(2025, 1, 1, 6, 0)) == "morning"
    assert get_time_bucket(datetime(2025, 1, 1, 8, 30)) == "morning"
    assert get_time_bucket(datetime(2025, 1, 1, 9, 0)) == "day"
    assert get_time_bucket(datetime(2025, 1, 1, 12, 0)) == "day"
    assert get_time_bucket(datetime(2025, 1, 1, 16, 59)) == "day"
    assert get_time_bucket(datetime(2025, 1, 1, 17, 0)) == "evening"
    assert get_time_bucket(datetime(2025, 1, 1, 21, 59)) == "evening"
    assert get_time_bucket(datetime(2025, 1, 1, 22, 0)) == "night"
    assert get_time_bucket(datetime(2025, 1, 1, 23, 59)) == "night"


def test_get_time_weight():
    """Test time-of-day weighting."""
    # Same bucket - emphasize
    assert get_time_weight("night", "night") == 1.5
    assert get_time_weight("day", "day") == 1.5

    # Different buckets - de-emphasize
    assert get_time_weight("night", "day") == 0.8
    assert get_time_weight("morning", "evening") == 0.8


def test_calculate_months_ago():
    """Test months ago calculation."""
    current = date(2025, 11, 1)

    assert calculate_months_ago(date(2025, 11, 1), current) == 0
    assert calculate_months_ago(date(2025, 10, 1), current) == 1
    assert calculate_months_ago(date(2025, 9, 1), current) == 2
    assert calculate_months_ago(date(2025, 5, 1), current) == 6
    assert calculate_months_ago(date(2024, 11, 1), current) == 12
    assert calculate_months_ago(date(2024, 10, 1), current) == 13


def test_normalize_score():
    """Test score normalization."""
    assert normalize_score(5, 0, 10) == pytest.approx(0.5, 0.01)
    assert normalize_score(0, 0, 10) == pytest.approx(0.0, 0.01)
    assert normalize_score(10, 0, 10) == pytest.approx(1.0, 0.01)

    # Edge case: min == max
    assert normalize_score(5, 5, 5) == 0.5


def test_risk_to_safety_score():
    """Test risk to safety score conversion."""
    assert risk_to_safety_score(0.0) == 100.0
    assert risk_to_safety_score(0.5) == 50.0
    assert risk_to_safety_score(1.0) == 0.0

    # Out of bounds
    assert risk_to_safety_score(-0.1) == 100.0
    assert risk_to_safety_score(1.1) == 0.0
