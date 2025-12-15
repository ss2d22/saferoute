.PHONY: help dev dev-up dev-down dev-logs dev-shell test test-unit test-integration test-e2e test-cov test-live lint format type-check migrate migrate-up migrate-down migrate-revision db-init db-reset db-shell clean install install-dev docker-build docker-push ingest-crimes build-grid full-pipeline docs-openapi docs-serve

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev          - Start development environment (docker-compose up)"
	@echo "  make dev-up       - Start services in background"
	@echo "  make dev-down     - Stop services"
	@echo "  make dev-logs     - View logs (follow mode)"
	@echo "  make dev-shell    - Open shell in app container"
	@echo "  make test         - Run all tests"
	@echo "  make test-unit    - Run unit tests only"
	@echo "  make test-integration - Run integration tests only"
	@echo "  make test-e2e     - Run end-to-end tests"
	@echo "  make test-cov     - Run tests with coverage report"
	@echo "  make test-live    - Run live integration tests (requires running containers)"
	@echo "  make lint         - Run linters (ruff, mypy)"
	@echo "  make format       - Format code (black, isort)"
	@echo "  make type-check   - Run type checker (mypy)"
	@echo "  make migrate      - Create new migration"
	@echo "  make migrate-up   - Apply migrations"
	@echo "  make migrate-down - Rollback last migration"
	@echo "  make migrate-revision - Create empty migration"
	@echo "  make db-init      - Initialize database (create, extensions)"
	@echo "  make db-reset     - Reset database (drop, create, migrate)"
	@echo "  make db-shell     - Open PostgreSQL shell"
	@echo "  make clean        - Remove build artifacts, cache, etc."
	@echo "  make install      - Install production dependencies"
	@echo "  make install-dev  - Install dev dependencies"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-push  - Push Docker image to registry"
	@echo "  make ingest-crimes - Ingest crime data (requires MONTH=YYYY-MM)"
	@echo "  make build-grid   - Build safety grid (requires MONTHS=N)"
	@echo "  make full-pipeline - Run full ingestion pipeline"
	@echo "  make docs-openapi - Export OpenAPI schema to docs/openapi.json"
	@echo "  make docs-serve   - Start local docs server on port 8000"

# Development
dev: dev-up
	@echo "Development environment started. Use 'make dev-logs' to view logs."

dev-up:
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 10
	@timeout=60; \
	while [ $$timeout -gt 0 ] && ! docker-compose ps app | grep -q "Up"; do \
		sleep 2; \
		timeout=$$((timeout - 2)); \
	done; \
	if docker-compose ps app | grep -q "Up"; then \
		echo "App container is ready"; \
		make migrate-up; \
	else \
		echo "ERROR: App container failed to start"; \
		docker-compose logs app; \
		exit 1; \
	fi

dev-down:
	docker-compose down

dev-logs:
	docker-compose logs -f app

dev-shell:
	docker-compose exec app /bin/bash

# Testing
test:
	poetry run python -m pytest tests/ -v

test-unit:
	poetry run python -m pytest tests/unit/ -v

test-integration:
	poetry run python -m pytest tests/integration/ -v

test-e2e:
	poetry run python -m pytest tests/e2e/ -v --maxfail=1

test-cov:
	poetry run python -m pytest tests/ --cov=app --cov-report=html --cov-report=term
	@echo "Coverage report generated in htmlcov/index.html"

test-live:
	@echo "Running live integration tests..."
	@./scripts/test-live.sh

# Code Quality
lint:
	poetry run python -m ruff check app/ tests/ || true
	poetry run python -m mypy app/ || true

format:
	poetry run python -m black app/ tests/ || true
	poetry run python -m isort app/ tests/ || true

type-check:
	poetry run python -m mypy app/ || true

# Database Migrations
migrate:
	@read -p "Migration message: " msg; \
	docker-compose exec app poetry run python -m alembic revision --autogenerate -m "$$msg"

migrate-up:
	docker-compose exec app poetry run python -m alembic upgrade head

migrate-down:
	docker-compose exec app poetry run python -m alembic downgrade -1

migrate-revision:
	@read -p "Migration message: " msg; \
	docker-compose exec app poetry run python -m alembic revision -m "$$msg"

# Database Management
db-init:
	docker-compose exec db psql -U saferoute -d saferoute -c "CREATE EXTENSION IF NOT EXISTS postgis;"
	docker-compose exec db psql -U saferoute -d saferoute -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
	@make migrate-up

db-reset:
	@echo "WARNING: This will destroy all data. Press Ctrl+C to cancel, or wait 5 seconds..."
	@sleep 5
	docker-compose exec db psql -U saferoute -d postgres -c "DROP DATABASE IF EXISTS saferoute;"
	docker-compose exec db psql -U saferoute -d postgres -c "CREATE DATABASE saferoute;"
	@make db-init

db-shell:
	docker-compose exec db psql -U saferoute -d saferoute

# Ingestion Commands
ingest-crimes:
	@if [ -z "$(MONTH)" ]; then \
		echo "Error: MONTH is required. Usage: make ingest-crimes MONTH=2025-06"; \
		exit 1; \
	fi
	docker-compose exec app poetry run python -m app.ingestion.cli ingest-crimes --area southampton --month $(MONTH)

build-grid:
	@if [ -z "$(MONTHS)" ]; then \
		echo "Error: MONTHS is required. Usage: make build-grid MONTHS=12"; \
		exit 1; \
	fi
	docker-compose exec app poetry run python -m app.ingestion.cli build-grid --area southampton --months $(MONTHS)

full-pipeline:
	docker-compose exec app poetry run python -m app.ingestion.cli full-pipeline --area southampton

# Retention job
retention:
	docker-compose exec app poetry run python scripts/retention_job.py

# Cleanup
clean:
	find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -r {} + 2>/dev/null || true
	rm -f .coverage
	rm -f .coverage.*

# Installation
install:
	poetry install --only main

install-dev:
	poetry install

# Docker
docker-build:
	docker build -t saferoute:latest -f docker/Dockerfile .

docker-push:
	@read -p "Registry (e.g., docker.io/username): " registry; \
	docker tag saferoute:latest $$registry/saferoute:latest; \
	docker push $$registry/saferoute:latest

# Documentation
docs-openapi:
	@echo "Exporting OpenAPI schema..."
	@/Users/sriram/miniconda3/envs/soton_crime_backend/bin/python -c "from app.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > docs/openapi.json
	@echo "OpenAPI schema exported to docs/openapi.json"
	@echo "You can import this into Postman, Insomnia, or other API tools"

docs-serve:
	@echo "Starting documentation server at http://localhost:8000"
	@echo "Visit http://localhost:8000/docs for Swagger UI"
	@echo "Visit http://localhost:8000/redoc for ReDoc"
	@echo "Press Ctrl+C to stop"
	@/Users/sriram/miniconda3/envs/soton_crime_backend/bin/uvicorn app.main:app --reload

