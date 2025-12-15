#!/bin/bash

# SafeRoute Setup Verification Script
# Verifies that all components are properly configured

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "================================================"
echo "  SafeRoute Setup Verification"
echo "================================================"
echo ""

# Check Python version
echo -n "Checking Python version... "
if command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
    if [[ "$PYTHON_VERSION" =~ ^3\.(11|12) ]]; then
        echo -e "${GREEN}✓${NC} Python $PYTHON_VERSION"
    else
        echo -e "${YELLOW}!${NC} Python $PYTHON_VERSION (3.11+ recommended)"
    fi
else
    echo -e "${RED}✗${NC} Python not found"
fi

# Check Docker
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}✓${NC} Docker $DOCKER_VERSION"
else
    echo -e "${RED}✗${NC} Docker not found"
fi

# Check Docker Compose
echo -n "Checking Docker Compose... "
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version | awk '{print $4}')
    echo -e "${GREEN}✓${NC} Docker Compose $COMPOSE_VERSION"
else
    echo -e "${RED}✗${NC} Docker Compose not found"
fi

# Check required files
echo ""
echo "Checking required files:"

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1 (missing)"
    fi
}

check_file "docker-compose.yml"
check_file "docker/Dockerfile"
check_file "Makefile"
check_file ".env.example"
check_file "pyproject.toml"
check_file "app/main.py"
check_file "scripts/test-live.sh"

# Check if .env exists
echo ""
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"

    # Check for required env vars
    if grep -q "ORS_API_KEY" .env; then
        ORS_KEY=$(grep "ORS_API_KEY" .env | cut -d= -f2 | tr -d '"' | tr -d "'")
        if [ -n "$ORS_KEY" ] && [ "$ORS_KEY" != "your-openrouteservice-api-key-here" ]; then
            echo -e "${GREEN}✓${NC} ORS_API_KEY is set"
        else
            echo -e "${YELLOW}!${NC} ORS_API_KEY not configured"
        fi
    fi
else
    echo -e "${YELLOW}!${NC} .env file not found (copy from .env.example)"
fi

# Check test results
echo ""
echo "Checking test suite:"
if [ -d "tests" ]; then
    echo -e "${GREEN}✓${NC} tests/ directory exists"

    # Count test files
    TEST_COUNT=$(find tests -name "test_*.py" | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} Found $TEST_COUNT test files"
else
    echo -e "${RED}✗${NC} tests/ directory not found"
fi

# Check key repository files
echo ""
echo "Checking key implementation files:"
check_file "app/repositories/user_repository.py"
check_file "app/repositories/route_repository.py"
check_file "app/repositories/crime_repository.py"

# Check for our fixes
echo ""
echo "Verifying critical fixes:"

# Check user repository has flag_modified
if grep -q "flag_modified" app/repositories/user_repository.py; then
    echo -e "${GREEN}✓${NC} User settings JSONB fix present"
else
    echo -e "${RED}✗${NC} User settings JSONB fix missing"
fi

# Check route repository has SQLite handling
if grep -q "dialect_name == \"sqlite\"" app/repositories/route_repository.py; then
    echo -e "${GREEN}✓${NC} Route repository SQLite compatibility present"
else
    echo -e "${RED}✗${NC} Route repository SQLite compatibility missing"
fi

# Check crime repository has dialect detection
if grep -q "dialect_name = self.db.bind.dialect.name" app/repositories/crime_repository.py; then
    echo -e "${GREEN}✓${NC} Crime repository dialect detection present"
else
    echo -e "${RED}✗${NC} Crime repository dialect detection missing"
fi

echo ""
echo "================================================"
echo "  Verification Complete"
echo "================================================"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and configure"
echo "  2. Run 'make dev-up' to start services"
echo "  3. Run 'make test' to verify tests pass"
echo "  4. Run 'make test-live' for live integration tests"
echo ""
