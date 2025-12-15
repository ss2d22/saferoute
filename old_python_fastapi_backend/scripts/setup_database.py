#!/usr/bin/env python3
"""
Setup database for SafeRoute deployment.

This script handles database initialization when deploying to environments
where the PostgreSQL container may already have an initialized volume.

It will:
1. Create the database if it doesn't exist
2. Create the user/role if it doesn't exist
3. Set up PostGIS extensions
4. Run Alembic migrations
5. Populate crime categories
"""

import os
import sys
import subprocess
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, ProgrammingError

# Get database credentials from environment
POSTGRES_USER = os.getenv('POSTGRES_USER', 'saferoute')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', 'changeme')
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'db')
POSTGRES_PORT = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'saferoute')


def create_database_and_user():
    """Create database and user if they don't exist."""
    print("=" * 70)
    print("Database Setup")
    print("=" * 70)
    print()

    # Try to connect as postgres superuser first
    postgres_url = f"postgresql+psycopg2://postgres:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/postgres"

    try:
        engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")

        with engine.connect() as conn:
            # Check if database exists
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                {"dbname": POSTGRES_DB}
            )

            if not result.fetchone():
                print(f"Creating database '{POSTGRES_DB}'...")
                conn.execute(text(f'CREATE DATABASE "{POSTGRES_DB}"'))
                print(f"✓ Database '{POSTGRES_DB}' created")
            else:
                print(f"⊘ Database '{POSTGRES_DB}' already exists")

            # Check if user exists
            result = conn.execute(
                text("SELECT 1 FROM pg_roles WHERE rolname = :username"),
                {"username": POSTGRES_USER}
            )

            if not result.fetchone():
                print(f"Creating user '{POSTGRES_USER}'...")
                conn.execute(
                    text(f"CREATE ROLE \"{POSTGRES_USER}\" LOGIN PASSWORD :password"),
                    {"password": POSTGRES_PASSWORD}
                )
                print(f"✓ User '{POSTGRES_USER}' created")
            else:
                print(f"⊘ User '{POSTGRES_USER}' already exists")

            # Grant privileges
            print(f"Granting privileges...")
            conn.execute(text(f'GRANT ALL PRIVILEGES ON DATABASE "{POSTGRES_DB}" TO "{POSTGRES_USER}"'))
            print("✓ Privileges granted")

        engine.dispose()
        return True

    except Exception as e:
        print(f"⚠ Could not connect as postgres superuser: {e}")
        print("Assuming database and user already exist...")
        return False


def setup_extensions():
    """Set up PostGIS extensions."""
    print()
    print("Setting up PostGIS extensions...")

    db_url = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

    try:
        engine = create_engine(db_url)

        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
            conn.commit()

        print("✓ PostGIS extensions created")
        engine.dispose()
        return True

    except Exception as e:
        print(f"✗ Error setting up extensions: {e}")
        return False


def run_migrations():
    """Run Alembic migrations."""
    print()
    print("Running database migrations...")

    try:
        result = subprocess.run(
            ['alembic', 'upgrade', 'head'],
            cwd='/app',
            capture_output=True,
            text=True,
            check=True
        )

        print(result.stdout)
        print("✓ Migrations completed")
        return True

    except subprocess.CalledProcessError as e:
        print(f"✗ Migration error: {e.stderr}")
        return False
    except Exception as e:
        print(f"✗ Error running migrations: {e}")
        return False


def populate_categories():
    """Populate crime categories."""
    print()
    print("Populating crime categories...")

    try:
        result = subprocess.run(
            ['python', 'scripts/populate_crime_categories.py'],
            cwd='/app',
            capture_output=True,
            text=True,
            check=True
        )

        print(result.stdout)
        return True

    except subprocess.CalledProcessError as e:
        print(f"✗ Error populating categories: {e.stderr}")
        # This might fail if categories already exist, which is okay
        if "already exists" in e.stderr or "duplicate key" in e.stderr.lower():
            print("⊘ Categories already populated")
            return True
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def main():
    """Main setup process."""
    print()
    print("=" * 70)
    print("SafeRoute Database Setup")
    print("=" * 70)
    print()
    print(f"Database: {POSTGRES_DB}")
    print(f"User: {POSTGRES_USER}")
    print(f"Host: {POSTGRES_HOST}:{POSTGRES_PORT}")
    print()

    # Step 1: Create database and user (may fail if not superuser, that's okay)
    create_database_and_user()

    # Step 2: Set up extensions
    if not setup_extensions():
        print()
        print("✗ Failed to set up extensions")
        return 1

    # Step 3: Run migrations
    if not run_migrations():
        print()
        print("✗ Failed to run migrations")
        return 1

    # Step 4: Populate categories
    if not populate_categories():
        print()
        print("⚠ Warning: Failed to populate categories (may need manual intervention)")

    print()
    print("=" * 70)
    print("Database setup complete!")
    print("=" * 70)
    print()
    print("Next step:")
    print("  Run ingestion: python scripts/ingest_crime_data.py --start-year 2024 --start-month 6 --end-year 2025 --end-month 9")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
