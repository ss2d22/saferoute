"""Integration tests for recency weighting in safety scoring."""

from datetime import date

import pytest
from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.utils.scoring import calculate_months_ago, get_recency_weight


def test_recency_weight_structure():
    """Test that recency weights follow expected decay pattern."""
    # Very recent (0-3 months): full weight
    assert get_recency_weight(0) == 1.0
    assert get_recency_weight(1) == 1.0
    assert get_recency_weight(3) == 1.0

    # Recent (4-6 months): 75% weight
    assert get_recency_weight(4) == 0.75
    assert get_recency_weight(5) == 0.75
    assert get_recency_weight(6) == 0.75

    # Older (7-12 months): 50% weight
    assert get_recency_weight(7) == 0.5
    assert get_recency_weight(9) == 0.5
    assert get_recency_weight(12) == 0.5

    # Very old (13+ months): 25% weight
    assert get_recency_weight(13) == 0.25
    assert get_recency_weight(18) == 0.25
    assert get_recency_weight(24) == 0.25


def test_calculate_months_ago():
    """Test months_ago calculation."""
    current = date(2025, 11, 1)

    # Same month
    assert calculate_months_ago(date(2025, 11, 1), current) == 0

    # Previous months
    assert calculate_months_ago(date(2025, 10, 1), current) == 1
    assert calculate_months_ago(date(2025, 9, 1), current) == 2
    assert calculate_months_ago(date(2025, 8, 1), current) == 3

    # 6 months ago
    assert calculate_months_ago(date(2025, 5, 1), current) == 6

    # 12 months ago
    assert calculate_months_ago(date(2024, 11, 1), current) == 12

    # Cross-year boundaries
    assert calculate_months_ago(date(2024, 1, 1), current) == 22


@pytest.fixture
def sample_cells_multiple_months(db: Session):
    """Create safety cells across multiple months to test recency weighting.

    Creates identical cells for different months to isolate recency effects.
    """
    import json
    from datetime import datetime

    from sqlalchemy import text

    from app.models import CrimeCategory

    # Create crime categories
    categories = [
        CrimeCategory(
            id="burglary",
            name="Burglary",
            harm_weight_default=2.0,
            is_personal=False,
            is_property=True,
        ),
        CrimeCategory(
            id="vehicle-crime",
            name="Vehicle crime",
            harm_weight_default=1.5,
            is_personal=False,
            is_property=True,
        ),
    ]

    for category in categories:
        db.add(category)
    db.commit()

    # Create cells for different months (all with identical crime patterns)
    current_month = date.today().replace(day=1)
    now = datetime.utcnow()

    # Month 0 (current): Full weight (1.0)
    # Month 1: Full weight (1.0)
    # Month 3: Full weight (1.0)
    # Month 5: 75% weight (0.75)
    # Month 9: 50% weight (0.5)
    # Month 15: 25% weight (0.25)

    months_to_test = [0, 1, 3, 5, 9, 15]

    for months_back in months_to_test:
        month = (current_month - relativedelta(months=months_back)).replace(day=1)

        db.execute(
            text(
                """
                INSERT INTO safety_cells
                (id, cell_id, geom, month, crime_count_total, crime_count_weighted, stats, updated_at)
                VALUES (:id, :cell_id, :geom, :month, :crime_count_total, :crime_count_weighted, :stats, :updated_at)
            """
            ),
            {
                "id": months_back + 1,
                "cell_id": f"test_cell_month_{months_back}",
                "geom": "POLYGON((-1.4 50.9, -1.39 50.9, -1.39 50.91, -1.4 50.91, -1.4 50.9))",
                "month": month,
                "crime_count_total": 100,
                "crime_count_weighted": 200.0,  # 100 burglaries * 2.0 weight
                "stats": json.dumps({"burglary": 100}),
                "updated_at": now,
            },
        )

    db.commit()
    return months_to_test


def test_safety_snapshot_applies_recency_weights(client, sample_cells_multiple_months):
    """Test that safety snapshot applies recency weighting correctly."""
    # Request 16 months of data to include all test cells
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 16,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    cells = {cell["id"]: cell for cell in data["cells"]}

    # Verify all 6 cells exist
    assert len(cells) == 6

    # Month 0 (current): 100 crimes * 2.0 weight * 1.0 recency = 200
    month_0_cell = cells.get("test_cell_month_0")
    assert month_0_cell is not None
    expected_weight_0 = 200.0 * 1.0
    assert abs(month_0_cell["crime_count_weighted"] - expected_weight_0) < 0.1

    # Month 1: 100 crimes * 2.0 weight * 1.0 recency = 200
    month_1_cell = cells.get("test_cell_month_1")
    assert month_1_cell is not None
    expected_weight_1 = 200.0 * 1.0
    assert abs(month_1_cell["crime_count_weighted"] - expected_weight_1) < 0.1

    # Month 3: 100 crimes * 2.0 weight * 1.0 recency = 200
    month_3_cell = cells.get("test_cell_month_3")
    assert month_3_cell is not None
    expected_weight_3 = 200.0 * 1.0
    assert abs(month_3_cell["crime_count_weighted"] - expected_weight_3) < 0.1

    # Month 5: 100 crimes * 2.0 weight * 0.75 recency = 150
    month_5_cell = cells.get("test_cell_month_5")
    assert month_5_cell is not None
    expected_weight_5 = 200.0 * 0.75
    assert abs(month_5_cell["crime_count_weighted"] - expected_weight_5) < 0.1

    # Month 9: 100 crimes * 2.0 weight * 0.5 recency = 100
    month_9_cell = cells.get("test_cell_month_9")
    assert month_9_cell is not None
    expected_weight_9 = 200.0 * 0.5
    assert abs(month_9_cell["crime_count_weighted"] - expected_weight_9) < 0.1

    # Month 15: 100 crimes * 2.0 weight * 0.25 recency = 50
    month_15_cell = cells.get("test_cell_month_15")
    assert month_15_cell is not None
    expected_weight_15 = 200.0 * 0.25
    assert abs(month_15_cell["crime_count_weighted"] - expected_weight_15) < 0.1


def test_recent_crimes_have_higher_impact(client, sample_cells_multiple_months):
    """Test that recent crimes contribute more to safety scores than old crimes."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 16,
        },
    )

    assert response.status_code == 200
    data = response.json()

    cells = {cell["id"]: cell for cell in data["cells"]}

    # Recent crime (month 0) should have higher weighted count than old crime (month 15)
    recent_cell = cells["test_cell_month_0"]
    old_cell = cells["test_cell_month_15"]

    # Both have same raw crime count
    assert recent_cell["crime_count"] == old_cell["crime_count"] == 100

    # But recent cell should have 4x the weighted count (1.0 vs 0.25)
    assert recent_cell["crime_count_weighted"] == pytest.approx(
        4 * old_cell["crime_count_weighted"]
    )

    # Recent cell should have higher risk score
    assert recent_cell["risk_score"] > old_cell["risk_score"]

    # Recent cell should have lower safety score
    assert recent_cell["safety_score"] < old_cell["safety_score"]


@pytest.fixture
def sample_cells_combined_weighting(db: Session):
    """Create cells to test combined time-of-day and recency weighting."""
    import json
    from datetime import datetime

    from dateutil.relativedelta import relativedelta
    from sqlalchemy import text

    from app.models import CrimeCategory

    # Create crime categories
    categories = [
        CrimeCategory(
            id="violent-crime",
            name="Violence and sexual offences",
            harm_weight_default=3.5,
            is_personal=True,
            is_property=False,
        ),
    ]

    for category in categories:
        db.add(category)
    db.commit()

    current_month = date.today().replace(day=1)
    now = datetime.utcnow()

    # Cell 1: Recent violent crime (current month)
    db.execute(
        text(
            """
            INSERT INTO safety_cells
            (id, cell_id, geom, month, crime_count_total, crime_count_weighted, stats, updated_at)
            VALUES (:id, :cell_id, :geom, :month, :crime_count_total, :crime_count_weighted, :stats, :updated_at)
        """
        ),
        {
            "id": 100,
            "cell_id": "test_cell_recent",
            "geom": "POLYGON((-1.4 50.9, -1.39 50.9, -1.39 50.91, -1.4 50.91, -1.4 50.9))",
            "month": current_month,
            "crime_count_total": 50,
            "crime_count_weighted": 175.0,  # 50 * 3.5
            "stats": json.dumps({"violent-crime": 50}),
            "updated_at": now,
        },
    )

    # Cell 2: Old violent crime (10 months ago)
    old_month = (current_month - relativedelta(months=10)).replace(day=1)
    db.execute(
        text(
            """
            INSERT INTO safety_cells
            (id, cell_id, geom, month, crime_count_total, crime_count_weighted, stats, updated_at)
            VALUES (:id, :cell_id, :geom, :month, :crime_count_total, :crime_count_weighted, :stats, :updated_at)
        """
        ),
        {
            "id": 101,
            "cell_id": "test_cell_old",
            "geom": "POLYGON((-1.39 50.9, -1.38 50.9, -1.38 50.91, -1.39 50.91, -1.39 50.9))",
            "month": old_month,
            "crime_count_total": 50,
            "crime_count_weighted": 175.0,  # 50 * 3.5
            "stats": json.dumps({"violent-crime": 50}),
            "updated_at": now,
        },
    )

    db.commit()


def test_combined_time_and_recency_weighting(client, sample_cells_combined_weighting):
    """Test that time-of-day and recency weights combine correctly."""
    # Test at night when violent crime is weighted 1.8x
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 12,
            "time_of_day": "night",
        },
    )

    assert response.status_code == 200
    data = response.json()

    cells = {cell["id"]: cell for cell in data["cells"]}

    recent_cell = cells["test_cell_recent"]
    old_cell = cells["test_cell_old"]

    # Recent cell: 50 crimes * 1.8 (night) * 1.0 (recency) = 90
    expected_recent = 50 * 1.8 * 1.0
    assert abs(recent_cell["crime_count_weighted"] - expected_recent) < 0.1

    # Old cell (10 months): 50 crimes * 1.8 (night) * 0.5 (recency) = 45
    expected_old = 50 * 1.8 * 0.5
    assert abs(old_cell["crime_count_weighted"] - expected_old) < 0.1

    # Recent cell should be 2x as dangerous as old cell
    assert recent_cell["crime_count_weighted"] == pytest.approx(
        2 * old_cell["crime_count_weighted"]
    )


def test_recency_weights_are_consistent():
    """Test that recency weight function is consistent and monotonically decreasing."""
    # Get weights for 0-24 months
    weights = [get_recency_weight(i) for i in range(25)]

    # All weights should be positive
    assert all(w > 0 for w in weights)

    # All weights should be <= 1.0
    assert all(w <= 1.0 for w in weights)

    # Weights should never increase as time goes on (monotonically decreasing or equal)
    for i in range(len(weights) - 1):
        assert (
            weights[i] >= weights[i + 1]
        ), f"Weight at month {i} ({weights[i]}) should be >= weight at month {i+1} ({weights[i+1]})"


def test_recency_weighting_with_short_lookback(client, sample_cells_multiple_months):
    """Test recency weighting with short lookback period (only recent data)."""
    # Only look back 4 months (should get months 0, 1, 3)
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 4,
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Should only get 3 cells (months 0, 1, 3)
    # Month 5 and beyond are outside the lookback window
    assert len(data["cells"]) == 3

    cell_ids = {cell["id"] for cell in data["cells"]}
    assert "test_cell_month_0" in cell_ids
    assert "test_cell_month_1" in cell_ids
    assert "test_cell_month_3" in cell_ids
    assert "test_cell_month_5" not in cell_ids
    assert "test_cell_month_9" not in cell_ids
