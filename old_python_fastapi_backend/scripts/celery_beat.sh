#!/bin/bash
# Celery beat (scheduler) startup script

set -e

# Set environment
export APP_ENV=${APP_ENV:-development}
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Celery beat scheduler...${NC}"

# Start Celery beat
celery -A app.celery_app beat \
    --loglevel=info \
    --scheduler=celery.beat:PersistentScheduler
