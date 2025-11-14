#!/bin/bash
set -e

# Check and fix DATABASE_URL if it doesn't have +psycopg2
if [ -n "$DATABASE_URL" ]; then
    echo "Original DATABASE_URL: ${DATABASE_URL:0:50}..."

    # If DATABASE_URL starts with postgresql:// (without +psycopg2), fix it
    if [[ "$DATABASE_URL" == postgresql://* ]] && [[ "$DATABASE_URL" != *"+psycopg2"* ]]; then
        export DATABASE_URL="${DATABASE_URL/postgresql:\/\//postgresql+psycopg2:\/\/}"
        echo "Fixed DATABASE_URL to include +psycopg2"
    fi

    echo "Final DATABASE_URL: ${DATABASE_URL:0:50}..."
else
    echo "WARNING: DATABASE_URL not set!"
fi

# Verify psycopg2 can be imported
python -c "import psycopg2; print(f'psycopg2 {psycopg2.__version__} loaded successfully')"

# Start the application
exec uvicorn app.main:app --host :: --port "$PORT"
