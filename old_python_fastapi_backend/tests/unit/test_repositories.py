"""Unit tests for repositories."""

from datetime import date, datetime

import pytest

from app.repositories.crime_repository import CrimeRepository
from app.repositories.user_repository import UserRepository


def test_user_repository_create(db):
    """Test creating a user."""
    repo = UserRepository(db)

    user = repo.create(email="test@example.com", hashed_password="hashed_password")

    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.is_active is True


def test_user_repository_get_by_email(db):
    """Test getting user by email."""
    repo = UserRepository(db)

    # Create user
    created_user = repo.create("findme@example.com", "hashed")

    # Find by email
    found_user = repo.get_by_email("findme@example.com")

    assert found_user is not None
    assert found_user.id == created_user.id


def test_user_repository_get_by_id(db):
    """Test getting user by ID."""
    repo = UserRepository(db)

    created_user = repo.create("findme@example.com", "hashed")
    found_user = repo.get_by_id(created_user.id)

    assert found_user is not None
    assert found_user.email == "findme@example.com"


def test_user_repository_update_last_login(db):
    """Test updating last login timestamp."""
    repo = UserRepository(db)

    user = repo.create("test@example.com", "hashed")
    assert user.last_login_at is None

    repo.update_last_login(user.id)

    db.refresh(user)
    assert user.last_login_at is not None


def test_user_repository_refresh_session_creation(db):
    """Test creating refresh session."""
    repo = UserRepository(db)

    user = repo.create("test@example.com", "hashed")
    expires_at = datetime.utcnow()

    session = repo.create_refresh_session(
        user_id=user.id,
        token_hash="hash123",
        expires_at=expires_at,
        ip_address="127.0.0.1",
        user_agent="TestAgent",
    )

    assert session.id is not None
    assert session.user_id == user.id
    assert session.token_hash == "hash123"
    assert session.revoked_at is None


def test_crime_repository_create_category(db):
    """Test creating crime category."""
    repo = CrimeRepository(db)

    category = repo.create_category(
        id="test-crime", name="Test Crime", harm_weight=2.5, is_personal=True, is_property=False
    )

    assert category.id == "test-crime"
    assert category.name == "Test Crime"
    assert float(category.harm_weight_default) == 2.5


def test_crime_repository_get_category(db, test_crime_categories):
    """Test getting crime category."""
    repo = CrimeRepository(db)

    category = repo.get_category("violent-crime")

    assert category is not None
    assert category.name == "Violence and sexual offences"
    assert float(category.harm_weight_default) == 3.5


@pytest.mark.skip(
    reason="Requires PostGIS - GeoAlchemy2 uses GeomFromEWKT() which doesn't exist in SQLite"
)
def test_crime_repository_create_incident(db, test_crime_categories):
    """Test creating crime incident."""
    repo = CrimeRepository(db)

    incident = repo.create_incident(
        month=date(2024, 9, 1),
        category_id="violent-crime",
        crime_type="Violence",
        force_id="hampshire",
        location_desc="On High Street",
        latitude=50.9097,
        longitude=-1.4044,
        external_id="123456",
    )

    assert incident.id is not None
    assert incident.category_id == "violent-crime"
    assert incident.force_id == "hampshire"
    assert incident.geom is not None
