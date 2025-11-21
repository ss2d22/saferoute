#!/bin/sh

echo "Dropping existing schema for clean start..."
node dist/src/database/drop-schema.js || echo "Schema drop failed, continuing..."

echo "Clearing old BullMQ job queue data..."
node dist/scripts/clear-old-jobs.js || echo "Job clear failed, continuing..."

echo "Starting application (synchronize will recreate tables + auto-seed categories)..."
# Increase heap size for H3 grid generation with large datasets (4GB)
exec node --max-old-space-size=4096 dist/src/main
