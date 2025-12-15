#!/bin/bash
# Celery worker startup script

set -e

# Set environment
export APP_ENV=${APP_ENV:-development}
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Celery worker...${NC}"

# Start Celery worker with autoreload in development
if [ "$APP_ENV" = "development" ]; then
    echo -e "${GREEN}Running in development mode with auto-reload${NC}"
    celery -A app.celery_app worker \
        --loglevel=info \
        --concurrency=2 \
        --autoscale=4,1 \
        --max-tasks-per-child=50 \
        --queues=ingestion,maintenance \
        --without-gossip \
        --without-mingle \
        --without-heartbeat
else
    echo -e "${GREEN}Running in production mode${NC}"
    celery -A app.celery_app worker \
        --loglevel=warning \
        --concurrency=4 \
        --autoscale=8,2 \
        --max-tasks-per-child=100 \
        --queues=ingestion,maintenance \
        --without-gossip \
        --without-mingle
fi
