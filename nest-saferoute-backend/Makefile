.PHONY: help dev dev-up dev-down dev-logs dev-shell test test-unit test-integration test-e2e test-cov test-live lint format type-check migrate migrate-create migrate-run migrate-revert seed db-init db-reset db-shell clean install install-dev docker-build docker-push

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
	@echo "  make lint         - Run linters (eslint)"
	@echo "  make format       - Format code (prettier)"
	@echo "  make type-check   - Run type checker (tsc)"
	@echo "  make migrate-create - Create new migration (NAME=migration_name)"
	@echo "  make migrate-run  - Run migrations"
	@echo "  make migrate-revert - Revert last migration"
	@echo "  make seed         - Seed database with crime categories"
	@echo "  make db-init      - Initialize database (create, extensions)"
	@echo "  make db-reset     - Reset database (drop, create, migrate)"
	@echo "  make db-shell     - Open PostgreSQL shell"
	@echo "  make clean        - Remove build artifacts, cache, etc."
	@echo "  make install      - Install production dependencies"
	@echo "  make install-dev  - Install dev dependencies"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-push  - Push Docker image to registry"

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
		make migrate-run; \
		docker-compose exec app npm run seed:categories; \
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
	docker-compose exec app /bin/sh

# Testing
test:
	npm run test

test-unit:
	npm run test -- --testPathPattern='.*\\.spec\\.ts$$'

test-integration:
	npm run test -- --testPathPattern='.*\\.integration-spec\\.ts$$'

test-e2e:
	npm run test:e2e

test-cov:
	npm run test:cov
	@echo "Coverage report generated in coverage/"

test-live:
	@echo "Running live integration tests..."
	@./scripts/test-live.sh

# Code Quality
lint:
	npm run lint

format:
	npm run format

type-check:
	npx tsc --noEmit

# Database Migrations
migrate-create:
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required. Usage: make migrate-create NAME=migration_name"; \
		exit 1; \
	fi
	npm run typeorm -- migration:create src/database/migrations/$(NAME)

migrate-run:
	docker-compose exec app npm run typeorm -- migration:run -d src/database/data-source.ts

migrate-revert:
	docker-compose exec app npm run typeorm -- migration:revert -d src/database/data-source.ts

seed:
	docker-compose exec app npm run seed:categories

# Database Management
db-init:
	docker-compose exec db psql -U saferoute -d saferoute -c "CREATE EXTENSION IF NOT EXISTS postgis;"
	docker-compose exec db psql -U saferoute -d saferoute -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
	@make migrate-run
	@make seed

db-reset:
	@echo "WARNING: This will destroy all data. Press Ctrl+C to cancel, or wait 5 seconds..."
	@sleep 5
	docker-compose exec db psql -U saferoute -d postgres -c "DROP DATABASE IF EXISTS saferoute;"
	docker-compose exec db psql -U saferoute -d postgres -c "CREATE DATABASE saferoute;"
	@make db-init

db-shell:
	docker-compose exec db psql -U saferoute -d saferoute

# Cleanup
clean:
	find . -type d -name "node_modules" -prune -o -type d -name "dist" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name "coverage" -exec rm -r {} + 2>/dev/null || true
	rm -rf dist/
	rm -rf coverage/

# Installation
install:
	npm ci --only=production

install-dev:
	npm install

# Docker
docker-build:
	docker build -t saferoute-nestjs:latest --target production .

docker-push:
	@read -p "Registry (e.g., docker.io/username): " registry; \
	docker tag saferoute-nestjs:latest $$registry/saferoute-nestjs:latest; \
	docker push $$registry/saferoute-nestjs:latest
