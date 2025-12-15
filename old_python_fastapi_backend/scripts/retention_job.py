"""Retention job for cleaning up old route history."""

import sys
import logging
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.repositories.route_repository import RouteRepository

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Create database session
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def run_retention_job():
    """Run the retention job to clean up old history."""
    logger.info("Starting retention job")
    
    try:
        db = SessionLocal()
        try:
            repo = RouteRepository(db)
            
            # Hard delete records older than 365 days
            deleted_count = repo.hard_delete_old_records(days=365)
            
            logger.info(f"Retention job complete. Deleted {deleted_count} old records.")
            return 0
            
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Error during retention job: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(run_retention_job())

