"""Database initialization script."""

import sys
from sqlalchemy import create_engine, text

from app.config import get_settings
from app.db.base import Base
from app.models import (
    User,
    RefreshSession,
    RouteHistory,
    CrimeCategory,
    CrimeIncident,
    SafetyCell,
    IngestionRun,
)

settings = get_settings()


def init_database():
    """Initialize database with extensions and tables."""
    try:
        engine = create_engine(settings.DATABASE_URL)
        
        # Create extensions
        with engine.connect() as conn:
            print("Creating PostGIS extension...")
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"))
            conn.commit()
        
        # Create all tables
        print("Creating tables...")
        Base.metadata.create_all(bind=engine)
        
        print("Database initialized successfully!")
        return 0
        
    except Exception as e:
        print(f"Error initializing database: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(init_database())

