"""Pytest configuration and fixtures."""

import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

# Set test environment
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["RATE_LIMIT_ENABLED"] = "false"  # Disable rate limiting in tests

from app.db.base import Base, get_db
from app.main import app
from app.models import CrimeCategory, User


# Test database setup - use in-memory database for better isolation
# Create a new engine for each test to ensure true isolation
@pytest.fixture(scope="function")
def db() -> Generator[Session, None, None]:
    """Create a fresh database for each test."""
    # Create a fresh engine for each test to ensure true isolation
    # Use file::memory:?cache=shared to allow multiple connections to the same in-memory database
    # This is crucial for FastAPI dependency injection to work properly
    engine = create_engine(
        "sqlite:///file:memdb1?mode=memory&cache=shared&uri=true",
        connect_args={"check_same_thread": False, "uri": True},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Remove tables that use PostGIS (SQLite doesn't support it)
    # We'll recreate them without the Geometry column for SQLite compatibility
    from sqlalchemy import (
        JSON,
        BigInteger,
        Column,
        Date,
        DateTime,
        Float,
        ForeignKey,
        Index,
        Integer,
        String,
        Table,
        Text,
    )

    tables_to_remove = ["route_history", "crime_incidents", "safety_cells"]
    for table_name in tables_to_remove:
        if table_name in Base.metadata.tables:
            Base.metadata.remove(Base.metadata.tables[table_name])

    # Create RouteHistory table manually without Geometry column for SQLite compatibility
    route_history_table = Table(
        "route_history",
        Base.metadata,
        Column("id", String(36), primary_key=True),  # UUID as string for SQLite
        Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        Column("created_at", DateTime, nullable=False),
        Column("origin_lat", Float, nullable=False),
        Column("origin_lng", Float, nullable=False),
        Column("destination_lat", Float, nullable=False),
        Column("destination_lng", Float, nullable=False),
        Column("mode", String(50), nullable=False),
        Column("safety_score_best", Float),
        Column("distance_m_best", Integer),
        Column("duration_s_best", Integer),
        Column("request_meta", JSON),
        Column("route_geom", String),  # Store as string in SQLite instead of Geometry
        Column("deleted_at", DateTime),
        Index("ix_route_history_user_id", "user_id"),
        Index("ix_route_history_user_created", "user_id", "created_at"),
    )

    # Create CrimeIncidents table without Geometry
    crime_incidents_table = Table(
        "crime_incidents",
        Base.metadata,
        Column("id", BigInteger, primary_key=True, autoincrement=True),
        Column("external_id", String),
        Column("month", Date, nullable=False, index=True),
        Column(
            "category_id", String, ForeignKey("crime_categories.id"), nullable=False, index=True
        ),
        Column("crime_type", String, nullable=False),
        Column("context", Text),
        Column("persistent_id", String),
        Column("lsoa_code", String),
        Column("force_id", String, nullable=False, index=True),
        Column("location_desc", Text),
        Column("geom", String),  # Store as WKT string in SQLite instead of Geometry
        Column("created_at", DateTime, nullable=False),
        Column("ingested_at", DateTime, nullable=False),
        Index("ix_crime_incidents_month_category", "month", "category_id"),
    )

    # Create SafetyCells table without Geometry
    safety_cells_table = Table(
        "safety_cells",
        Base.metadata,
        Column("id", BigInteger, primary_key=True),
        Column("cell_id", String, unique=True, nullable=False, index=True),
        Column("geom", String),  # Store as WKT string in SQLite instead of Geometry
        Column("month", Date, nullable=False, index=True),
        Column("crime_count_total", Integer, nullable=False),
        Column("crime_count_weighted", Float, nullable=False),
        Column("stats", JSON),
        Column("updated_at", DateTime, nullable=False),
    )

    # Drop all tables and indexes first to ensure clean state
    # First, manually drop all tables (SQLite needs this for proper cleanup)
    with engine.connect() as conn:
        # Get all tables from sqlite_master
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        )
        tables = [row[0] for row in result]
        # Drop tables in reverse dependency order (child tables first)
        # This handles foreign key constraints
        for table_name in reversed(tables):
            try:
                conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            except Exception:
                pass  # Ignore errors if table doesn't exist

        # Get all remaining indexes from sqlite_master
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
        )
        indexes = [row[0] for row in result]
        for index_name in indexes:
            try:
                conn.execute(text(f"DROP INDEX IF EXISTS {index_name}"))
            except Exception:
                pass  # Ignore errors if index doesn't exist
        conn.commit()

    # Also use metadata drop as a fallback
    Base.metadata.drop_all(bind=engine, checkfirst=True)

    # Create tables individually, handling index conflicts gracefully
    # This handles cases where indexes somehow persist despite cleanup
    import re

    from sqlalchemy.exc import OperationalError

    def create_table_safely(table):
        """Create a table, handling conflicts by dropping and retrying."""
        max_retries = 2
        for attempt in range(max_retries):
            try:
                table.create(bind=engine, checkfirst=False)
                return
            except OperationalError as e:
                error_str = str(e)
                if "already exists" in error_str:
                    if "table" in error_str.lower():
                        # Table already exists - drop it and retry
                        table_name = table.name
                        if attempt < max_retries - 1:
                            with engine.connect() as conn:
                                try:
                                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                                    # Also drop any indexes for this table
                                    result = conn.execute(
                                        text(
                                            f"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='{table_name}' AND name NOT LIKE 'sqlite_%'"
                                        )
                                    )
                                    indexes = [row[0] for row in result]
                                    for index_name in indexes:
                                        try:
                                            conn.execute(text(f"DROP INDEX IF EXISTS {index_name}"))
                                        except Exception:
                                            pass
                                    conn.commit()
                                except Exception:
                                    pass
                            continue
                        # If we can't drop it, the table exists and we should skip
                        return
                    elif "index" in error_str.lower():
                        # Extract index name from error message
                        # Format: "index ix_name already exists" or "CREATE INDEX ix_name ON table"
                        match = re.search(
                            r"index\s+([a-zA-Z_][a-zA-Z0-9_]*)", error_str, re.IGNORECASE
                        )
                        if match and attempt < max_retries - 1:
                            index_name = match.group(1)
                            # Drop the problematic index and retry
                            with engine.connect() as conn:
                                try:
                                    conn.execute(text(f"DROP INDEX IF EXISTS {index_name}"))
                                    conn.commit()
                                except Exception:
                                    pass
                            continue
                        # If we can't extract the name or it's the last attempt, ignore
                        # The table was likely created, just the index failed
                        return
                else:
                    raise

    tables_to_create = [
        Base.metadata.tables["users"],
        Base.metadata.tables["refresh_sessions"],
        Base.metadata.tables["crime_categories"],
        Base.metadata.tables["ingestion_runs"],
    ]

    for table in tables_to_create:
        create_table_safely(table)

    # Create tables with PostGIS-incompatible columns separately
    create_table_safely(route_history_table)
    create_table_safely(crime_incidents_table)
    create_table_safely(safety_cells_table)

    # Note: We create String-based geometry columns for SQLite, but the ORM models
    # still have Geometry() columns defined. This causes GeoAlchemy2 to wrap values
    # in GeomFromEWKT() which doesn't exist in SQLite.
    # For now, tests that directly create geometry-heavy records should be skipped.
    # Route history and other features that don't require PostGIS functions will work.

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Clean up: drop all tables and close connections
        Base.metadata.drop_all(bind=engine)
        engine.dispose()  # Dispose of the engine to free resources


@pytest.fixture(scope="function")
def client(db: Session) -> Generator[TestClient, None, None]:
    """Create a test client with database override."""

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db: Session) -> User:
    """Create a test user or return existing one."""
    from app.core.security import hash_password

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == "test@example.com").first()
    if existing_user:
        return existing_user

    user = User(
        email="test@example.com",
        hashed_password=hash_password("TestPassword123"),
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client: TestClient, db: Session) -> dict:
    """Get authentication headers for test user.

    Creates a test user in the same db session that client uses,
    then logs in to get auth headers.
    """
    from app.core.security import hash_password

    # Check if user already exists (in case test_user fixture was already called)
    existing_user = db.query(User).filter(User.email == "test@example.com").first()
    if not existing_user:
        # Create user in the same db that client is using
        user = User(
            email="test@example.com",
            hashed_password=hash_password("TestPassword123"),
            is_active=True,
            is_superuser=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Now login with that user
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "TestPassword123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_crime_categories(db: Session) -> list[CrimeCategory]:
    """Create test crime categories."""
    categories = [
        CrimeCategory(
            id="violent-crime",
            name="Violence and sexual offences",
            harm_weight_default=3.5,
            is_personal=True,
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
    ]

    for category in categories:
        db.add(category)
    db.commit()

    for category in categories:
        db.refresh(category)

    return categories
