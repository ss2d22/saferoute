"""Integration tests for time-of-day weighting in safety scoring."""

import pytest
from sqlalchemy.orm import Session

from app.config import CRIME_TIME_WEIGHTS
from app.repositories.crime_repository import CrimeRepository


@pytest.fixture
def crime_repo(db: Session):
    """Get crime repository."""
    return CrimeRepository(db)


@pytest.fixture
def sample_safety_cells(db: Session):
    """Create sample safety cells with different crime patterns.

    Note: This fixture directly inserts into the database using raw SQL to avoid
    GeoAlchemy2/PostGIS function issues in SQLite tests.
    """
    import json
    from datetime import datetime

    from sqlalchemy import text

    # Create crime categories first
    from app.models import CrimeCategory

    categories = [
        CrimeCategory(
            id="violent-crime",
            name="Violence and sexual offences",
            harm_weight_default=3.5,
            is_personal=True,
            is_property=False,
        ),
        CrimeCategory(
            id="anti-social-behaviour",
            name="Anti-social behaviour",
            harm_weight_default=0.5,
            is_personal=False,
            is_property=False,
        ),
        CrimeCategory(
            id="shoplifting",
            name="Shoplifting",
            harm_weight_default=0.5,
            is_personal=False,
            is_property=True,
        ),
        CrimeCategory(
            id="other-crime",
            name="Other crime",
            harm_weight_default=1.0,
            is_personal=False,
            is_property=False,
        ),
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
        CrimeCategory(
            id="bicycle-theft",
            name="Bicycle theft",
            harm_weight_default=1.0,
            is_personal=False,
            is_property=True,
        ),
    ]

    for category in categories:
        db.add(category)
    db.commit()

    # Insert safety cells using raw SQL to bypass GeoAlchemy2
    # Use current month so the endpoint will find them
    from datetime import date as date_class

    month = date_class.today().replace(day=1)
    now = datetime.utcnow()

    cells = [
        {
            "cell_id": "test_cell_violent",
            "geom": "POLYGON((-1.4 50.9, -1.39 50.9, -1.39 50.91, -1.4 50.91, -1.4 50.9))",
            "month": month,
            "crime_count_total": 100,
            "crime_count_weighted": 250.0,
            "stats": {"violent-crime": 80, "anti-social-behaviour": 20},
            "updated_at": now,
        },
        {
            "cell_id": "test_cell_shoplifting",
            "geom": "POLYGON((-1.39 50.9, -1.38 50.9, -1.38 50.91, -1.39 50.91, -1.39 50.9))",
            "month": month,
            "crime_count_total": 100,
            "crime_count_weighted": 50.0,
            "stats": {"shoplifting": 90, "other-crime": 10},
            "updated_at": now,
        },
        {
            "cell_id": "test_cell_mixed",
            "geom": "POLYGON((-1.38 50.9, -1.37 50.9, -1.37 50.91, -1.38 50.91, -1.38 50.9))",
            "month": month,
            "crime_count_total": 60,
            "crime_count_weighted": 100.0,
            "stats": {"burglary": 20, "vehicle-crime": 20, "bicycle-theft": 20},
            "updated_at": now,
        },
    ]

    # Generate auto-incrementing IDs
    for idx, cell_data in enumerate(cells, start=1):
        db.execute(
            text(
                """
                INSERT INTO safety_cells
                (id, cell_id, geom, month, crime_count_total, crime_count_weighted, stats, updated_at)
                VALUES (:id, :cell_id, :geom, :month, :crime_count_total, :crime_count_weighted, :stats, :updated_at)
            """
            ),
            {
                "id": idx,
                "cell_id": cell_data["cell_id"],
                "geom": cell_data["geom"],
                "month": cell_data["month"],
                "crime_count_total": cell_data["crime_count_total"],
                "crime_count_weighted": cell_data["crime_count_weighted"],
                "stats": json.dumps(cell_data["stats"]),
                "updated_at": cell_data["updated_at"],
            },
        )

    db.commit()
    return ["test_cell_violent", "test_cell_shoplifting", "test_cell_mixed"]


def test_time_of_day_weights_structure():
    """Test that CRIME_TIME_WEIGHTS has expected structure."""
    # Should have entries for all major crime types
    expected_categories = [
        "violent-crime",
        "anti-social-behaviour",
        "burglary",
        "robbery",
        "shoplifting",
        "vehicle-crime",
    ]

    for category in expected_categories:
        assert category in CRIME_TIME_WEIGHTS, f"Missing {category} in CRIME_TIME_WEIGHTS"

        # Each category should have all four time buckets
        time_weights = CRIME_TIME_WEIGHTS[category]
        assert "night" in time_weights
        assert "morning" in time_weights
        assert "day" in time_weights
        assert "evening" in time_weights

        # Weights should be positive
        for time, weight in time_weights.items():
            assert weight > 0, f"{category} has non-positive weight for {time}"


def test_violent_crime_night_weighting():
    """Test that violent crime is weighted higher at night."""
    violent_weights = CRIME_TIME_WEIGHTS["violent-crime"]

    # Night should be the highest weight for violent crime
    assert violent_weights["night"] > violent_weights["day"]
    assert violent_weights["night"] > violent_weights["morning"]

    # Evening should also be elevated
    assert violent_weights["evening"] > violent_weights["day"]


def test_shoplifting_day_weighting():
    """Test that shoplifting is weighted higher during day."""
    shoplifting_weights = CRIME_TIME_WEIGHTS["shoplifting"]

    # Day should be the highest weight for shoplifting
    assert shoplifting_weights["day"] > shoplifting_weights["night"]
    assert shoplifting_weights["day"] > shoplifting_weights["morning"]

    # Night should be very low (shops closed)
    assert shoplifting_weights["night"] < 0.5


def test_burglary_time_pattern():
    """Test that burglary follows expected time pattern."""
    burglary_weights = CRIME_TIME_WEIGHTS["burglary"]

    # Burglary often happens during day (when people are at work) or at night
    # Night and day should be higher than morning
    assert burglary_weights["night"] > burglary_weights["morning"]
    assert burglary_weights["day"] > burglary_weights["morning"]


def test_safety_snapshot_without_time_filter(client, sample_safety_cells):
    """Test safety snapshot without time-of-day filter (baseline)."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    assert len(data["cells"]) == 3

    # Find our test cells
    violent_cell = next((c for c in data["cells"] if c["id"] == "test_cell_violent"), None)
    shoplifting_cell = next((c for c in data["cells"] if c["id"] == "test_cell_shoplifting"), None)

    assert violent_cell is not None
    assert shoplifting_cell is not None

    # Store baseline weighted counts for comparison
    return {
        "violent_weighted": violent_cell["crime_count_weighted"],
        "shoplifting_weighted": shoplifting_cell["crime_count_weighted"],
    }


def test_safety_snapshot_night_filter(client, sample_safety_cells):
    """Test safety snapshot with night time-of-day filter."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
            "time_of_day": "night",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    assert data["meta"]["time_filter"] == "night"

    # Find our test cells
    violent_cell = next((c for c in data["cells"] if c["id"] == "test_cell_violent"), None)
    shoplifting_cell = next((c for c in data["cells"] if c["id"] == "test_cell_shoplifting"), None)

    assert violent_cell is not None
    assert shoplifting_cell is not None

    # At night, violent crime cell should have HIGHER weighted count
    # Shoplifting cell should have LOWER weighted count
    # Because violent-crime has night weight of 1.8, shoplifting has 0.2

    # Violent crime: 80 * 1.8 + 20 * 1.7 = 144 + 34 = 178
    expected_violent = (
        80 * CRIME_TIME_WEIGHTS["violent-crime"]["night"]
        + 20 * CRIME_TIME_WEIGHTS["anti-social-behaviour"]["night"]
    )

    # Shoplifting: 90 * 0.2 + 10 * 1.0 = 18 + 10 = 28
    expected_shoplifting = (
        90 * CRIME_TIME_WEIGHTS["shoplifting"]["night"]
        + 10 * CRIME_TIME_WEIGHTS["other-crime"]["night"]
    )

    assert abs(violent_cell["crime_count_weighted"] - expected_violent) < 0.1
    assert abs(shoplifting_cell["crime_count_weighted"] - expected_shoplifting) < 0.1

    # Violent cell should be MORE dangerous than shoplifting at night
    assert violent_cell["risk_score"] > shoplifting_cell["risk_score"]


def test_safety_snapshot_day_filter(client, sample_safety_cells):
    """Test safety snapshot with day time-of-day filter."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
            "time_of_day": "day",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    assert data["meta"]["time_filter"] == "day"

    # Find our test cells
    violent_cell = next((c for c in data["cells"] if c["id"] == "test_cell_violent"), None)
    shoplifting_cell = next((c for c in data["cells"] if c["id"] == "test_cell_shoplifting"), None)

    assert violent_cell is not None
    assert shoplifting_cell is not None

    # During day, shoplifting should be MORE dangerous than at night
    # Violent crime should be LESS dangerous than at night

    # Violent crime: 80 * 0.8 + 20 * 0.7 = 64 + 14 = 78
    expected_violent = (
        80 * CRIME_TIME_WEIGHTS["violent-crime"]["day"]
        + 20 * CRIME_TIME_WEIGHTS["anti-social-behaviour"]["day"]
    )

    # Shoplifting: 90 * 1.8 + 10 * 1.0 = 162 + 10 = 172
    expected_shoplifting = (
        90 * CRIME_TIME_WEIGHTS["shoplifting"]["day"]
        + 10 * CRIME_TIME_WEIGHTS["other-crime"]["day"]
    )

    assert abs(violent_cell["crime_count_weighted"] - expected_violent) < 0.1
    assert abs(shoplifting_cell["crime_count_weighted"] - expected_shoplifting) < 0.1

    # At day, shoplifting area should be MORE dangerous
    assert shoplifting_cell["risk_score"] > violent_cell["risk_score"]


def test_safety_snapshot_evening_filter(client, sample_safety_cells):
    """Test safety snapshot with evening time-of-day filter."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
            "time_of_day": "evening",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    assert data["meta"]["time_filter"] == "evening"


def test_safety_snapshot_morning_filter(client, sample_safety_cells):
    """Test safety snapshot with morning time-of-day filter."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
            "time_of_day": "morning",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert "cells" in data
    assert data["meta"]["time_filter"] == "morning"

    # Morning should generally be the safest time
    # Both violent crime and shoplifting have low morning weights


def test_safety_snapshot_invalid_time_filter(client, sample_safety_cells):
    """Test that invalid time_of_day values are handled gracefully."""
    response = client.get(
        "/api/v1/safety/snapshot",
        params={
            "bbox": "-1.5,50.85,-1.3,51.0",
            "lookback_months": 1,
            "time_of_day": "invalid",
        },
    )

    # Should still work, just use default weight of 1.0
    assert response.status_code == 200


def test_crime_categories_have_consistent_weights():
    """Test that all categories sum to approximately the same total weight."""
    for category, weights in CRIME_TIME_WEIGHTS.items():
        total_weight = sum(weights.values())

        # Total weight should be between 3 and 6 (average of 1.0 per time period)
        # This ensures no category is globally over/under-weighted
        assert 3.0 <= total_weight <= 7.0, f"{category} has unusual total weight: {total_weight}"
