#!/bin/bash

# SafeRoute Live Integration Test Script (NestJS)
# This script tests ALL API endpoints against a running Docker container

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:8000}"
MAX_RETRIES=30
RETRY_DELAY=2
VERBOSE="${VERBOSE:-1}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_response() {
    if [ "$VERBOSE" = "1" ]; then
        echo -e "${CYAN}Response:${NC}"
        echo "$1" | python3 -m json.tool 2>/dev/null || echo "$1"
        echo ""
    fi
}

# Wait for API to be ready
wait_for_api() {
    log_info "Waiting for API to be ready at $API_URL..."
    local retries=0

    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -s -f "$API_URL/health" > /dev/null 2>&1; then
            log_success "API is ready!"
            return 0
        fi

        retries=$((retries + 1))
        log_info "Waiting... ($retries/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    done

    log_error "API failed to become ready after $MAX_RETRIES attempts"
    return 1
}

# Test health endpoint
test_health() {
    log_info "Testing: GET /health"

    response=$(curl -s -w "\n%{http_code}" "$API_URL/health")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Health check (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Health check (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test user registration
test_register() {
    log_info "Testing: POST /api/v1/auth/register"

    local email="test-$(date +%s)@example.com"
    local password="TestPass123!"

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "201" ]; then
        log_success "User registration (HTTP $http_code)"
        log_response "$body"
        # Store for next tests
        echo "$email:$password" > /tmp/saferoute_test_user.txt
    else
        log_error "User registration (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test user login
test_login() {
    log_info "Testing: POST /api/v1/auth/login"

    if [ ! -f /tmp/saferoute_test_user.txt ]; then
        log_warning "Skipping login test - no user created"
        return
    fi

    local credentials=$(cat /tmp/saferoute_test_user.txt)
    local email=$(echo "$credentials" | cut -d: -f1)
    local password=$(echo "$credentials" | cut -d: -f2)

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "User login (HTTP $http_code)"
        log_response "$body"
        # Extract token
        access_token=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        echo "$access_token" > /tmp/saferoute_test_token.txt
    else
        log_error "User login (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get safe routes (anonymous)
test_get_routes_anonymous() {
    log_info "Testing: POST /api/v1/routes/safe (anonymous)"

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/routes/safe" \
        -H "Content-Type: application/json" \
        -d '{
            "origin": {"lat": 50.9097, "lng": -1.4044},
            "destination": {"lat": 50.9130, "lng": -1.4300},
            "mode": "foot-walking"
        }')

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        log_success "Get safe routes - anonymous (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get safe routes - anonymous (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get current user
test_get_current_user() {
    log_info "Testing: GET /api/v1/auth/me"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping get current user test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/auth/me" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Get current user (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get current user (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test artifacts..."
    rm -f /tmp/saferoute_test_user.txt
    rm -f /tmp/saferoute_test_token.txt
}

# Main test execution
main() {
    echo ""
    echo "================================================"
    echo "  SafeRoute Live Integration Tests (NestJS)"
    echo "  API URL: $API_URL"
    echo "  Verbose: $VERBOSE"
    echo "================================================"
    echo ""

    # Wait for API
    if ! wait_for_api; then
        log_error "Cannot proceed - API is not accessible"
        exit 1
    fi

    echo ""
    log_info "Starting test suite..."
    echo ""

    # === Public Endpoints ===
    echo -e "${MAGENTA}=== Health & Monitoring ===${NC}"
    test_health
    echo ""

    echo -e "${MAGENTA}=== Authentication Flow ===${NC}"
    test_register
    test_login
    test_get_current_user
    echo ""

    echo -e "${MAGENTA}=== Routing Endpoints ===${NC}"
    test_get_routes_anonymous
    echo ""

    # Cleanup
    cleanup

    # Summary
    echo ""
    echo "================================================"
    echo "  Test Summary"
    echo "================================================"
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    echo "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        log_success "All tests passed! 🎉"
        exit 0
    else
        log_error "Some tests failed"
        exit 1
    fi
}

# Run main function
main "$@"
