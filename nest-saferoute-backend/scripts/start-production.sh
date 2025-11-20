#!/bin/sh
set -e

echo "Running database migrations..."
node dist/src/database/run-migrations.js

echo "Starting application..."
exec node dist/src/main
