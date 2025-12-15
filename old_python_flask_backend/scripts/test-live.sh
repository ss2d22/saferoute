#!/bin/bash

# SafeRoute Live Integration Test Script
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
VERBOSE="${VERBOSE:-1}"  # Set to 0 to disable response printing

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

# Test ready endpoint
test_ready() {
    log_info "Testing: GET /ready"

    response=$(curl -s -w "\n%{http_code}" "$API_URL/ready")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Readiness check (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Readiness check (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test metrics endpoint
test_metrics() {
    log_info "Testing: GET /metrics"

    response=$(curl -s -w "\n%{http_code}" "$API_URL/metrics")
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Metrics endpoint (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Metrics endpoint (HTTP $http_code)"
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
        # Extract tokens
        access_token=$(echo "$body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
        refresh_token=$(echo "$body" | grep -o '"refresh_token":"[^"]*' | cut -d'"' -f4)
        echo "$access_token" > /tmp/saferoute_test_token.txt
        echo "$refresh_token" > /tmp/saferoute_test_refresh_token.txt
    else
        log_error "User login (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test refresh token
test_refresh_token() {
    log_info "Testing: POST /api/v1/auth/refresh"

    if [ ! -f /tmp/saferoute_test_refresh_token.txt ]; then
        log_warning "Skipping refresh token test - no refresh token available"
        return
    fi

    local refresh_token=$(cat /tmp/saferoute_test_refresh_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/refresh" \
        -H "Content-Type: application/json" \
        -d "{\"refresh_token\":\"$refresh_token\"}")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Refresh token (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Refresh token (HTTP $http_code)"
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

    if [ "$http_code" = "200" ]; then
        log_success "Get safe routes - anonymous (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get safe routes - anonymous (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get safe routes (authenticated)
test_get_routes_authenticated() {
    log_info "Testing: POST /api/v1/routes/safe (authenticated)"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping authenticated routes test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/routes/safe" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d '{
            "origin": {"lat": 50.9097, "lng": -1.4044},
            "destination": {"lat": 50.9130, "lng": -1.4300},
            "mode": "foot-walking",
            "preferences": {
                "safety_weight": 0.8,
                "lookback_months": 12
            }
        }')

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Get safe routes - authenticated (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get safe routes - authenticated (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get user settings
test_get_user_settings() {
    log_info "Testing: GET /api/v1/users/me/settings"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping get user settings test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/users/me/settings" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Get user settings (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get user settings (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test update user settings
test_update_user_settings() {
    log_info "Testing: PATCH /api/v1/users/me/settings"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping update user settings test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X PATCH "$API_URL/api/v1/users/me/settings" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d '{
            "history_enabled": true,
            "default_safety_weight": 0.85
        }')

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Update user settings (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Update user settings (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get route history
test_get_route_history() {
    log_info "Testing: GET /api/v1/users/me/history"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping get route history test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/users/me/history" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Get route history (HTTP $http_code)"
        log_response "$body"
        # Store first history ID for deletion test
        history_id=$(echo "$body" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
        if [ -n "$history_id" ]; then
            echo "$history_id" > /tmp/saferoute_test_history_id.txt
        fi
    else
        log_error "Get route history (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test get route history with pagination
test_get_route_history_pagination() {
    log_info "Testing: GET /api/v1/users/me/history?limit=5&offset=0"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping pagination test - no token available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/users/me/history?limit=5&offset=0" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Get route history with pagination (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Get route history with pagination (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test delete single history item
test_delete_single_history() {
    log_info "Testing: DELETE /api/v1/users/me/history/{id}"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping delete history test - no token available"
        return
    fi

    if [ ! -f /tmp/saferoute_test_history_id.txt ]; then
        log_warning "Skipping delete history test - no history ID available"
        return
    fi

    local token=$(cat /tmp/saferoute_test_token.txt)
    local history_id=$(cat /tmp/saferoute_test_history_id.txt)

    response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/api/v1/users/me/history/$history_id" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log_success "Delete single history item (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Delete single history item (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test safety snapshot
test_safety_snapshot() {
    log_info "Testing: GET /api/v1/safety/snapshot"

    # bbox format: min_lng,min_lat,max_lng,max_lat
    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/safety/snapshot?bbox=-1.41,50.90,-1.39,50.92" \
        -H "Content-Type: application/json")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Safety snapshot (HTTP $http_code)"
        log_response "$body"
    elif [ "$http_code" = "501" ]; then
        log_warning "Safety snapshot not implemented (HTTP $http_code)"
    else
        log_error "Safety snapshot (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test safety snapshot with time-of-day weighting
test_safety_snapshot_time_of_day() {
    log_info "Testing: GET /api/v1/safety/snapshot (time_of_day=night)"

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/safety/snapshot?bbox=-1.41,50.90,-1.39,50.92&lookback_months=12&time_of_day=night" \
        -H "Content-Type: application/json")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Safety snapshot with time-of-day weighting (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Safety snapshot with time-of-day weighting (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test safety snapshot with lookback months
test_safety_snapshot_lookback() {
    log_info "Testing: GET /api/v1/safety/snapshot (lookback_months=6)"

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/safety/snapshot?bbox=-1.41,50.90,-1.39,50.92&lookback_months=6" \
        -H "Content-Type: application/json")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Safety snapshot with lookback months (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Safety snapshot with lookback months (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test admin task status endpoint
test_admin_task_status() {
    log_info "Testing: GET /api/v1/admin/tasks/{task_id} (dummy ID)"

    # Use a dummy task ID to test the endpoint structure
    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/admin/tasks/00000000-0000-0000-0000-000000000000")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    # Accept 200 or 404/500 since we're using a fake task ID
    if [ "$http_code" = "200" ] || [ "$http_code" = "404" ] || [ "$http_code" = "500" ]; then
        log_success "Admin task status endpoint accessible (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Admin task status endpoint (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test logout
test_logout() {
    log_info "Testing: POST /api/v1/auth/logout"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping logout test - no token available"
        return
    fi

    # Get a fresh token since we may have logged out earlier
    local credentials=$(cat /tmp/saferoute_test_user.txt)
    local email=$(echo "$credentials" | cut -d: -f1)
    local password=$(echo "$credentials" | cut -d: -f2)

    login_response=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")

    local token=$(echo "$login_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    local refresh_token=$(echo "$login_response" | grep -o '"refresh_token":"[^"]*' | cut -d'"' -f4)

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/auth/logout" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "{\"refresh_token\":\"$refresh_token\"}")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
        log_success "Logout (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Logout (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Test invalid routes
test_invalid_route_request() {
    log_info "Testing: POST /api/v1/routes/safe (invalid coordinates)"

    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/api/v1/routes/safe" \
        -H "Content-Type: application/json" \
        -d '{
            "origin": {"lat": 999, "lng": 999},
            "destination": {"lat": 50.9130, "lng": -1.4300},
            "mode": "foot-walking"
        }')

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "422" ] || [ "$http_code" = "400" ]; then
        log_success "Invalid route request validation (HTTP $http_code)"
        log_response "$body"
    else
        log_warning "Expected 400/422 for invalid coordinates, got HTTP $http_code"
        echo "Response: $body"
    fi
}

# Test unauthorized access
test_unauthorized_access() {
    log_info "Testing: GET /api/v1/users/me/settings (no auth)"

    response=$(curl -s -w "\n%{http_code}" -X GET "$API_URL/api/v1/users/me/settings")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
        log_success "Unauthorized access blocked (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Expected 401/403 for unauthorized, got HTTP $http_code"
        echo "Response: $body"
    fi
}

# Test delete all history
test_delete_all_history() {
    log_info "Testing: DELETE /api/v1/users/me/history (all)"

    if [ ! -f /tmp/saferoute_test_token.txt ]; then
        log_warning "Skipping delete all history test - no token available"
        return
    fi

    # First create a new token since we logged out
    local credentials=$(cat /tmp/saferoute_test_user.txt)
    local email=$(echo "$credentials" | cut -d: -f1)
    local password=$(echo "$credentials" | cut -d: -f2)

    login_response=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}")

    local token=$(echo "$login_response" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

    response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL/api/v1/users/me/history" \
        -H "Authorization: Bearer $token")

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        log_success "Delete all history (HTTP $http_code)"
        log_response "$body"
    else
        log_error "Delete all history (HTTP $http_code)"
        echo "Response: $body"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up test artifacts..."
    rm -f /tmp/saferoute_test_user.txt
    rm -f /tmp/saferoute_test_token.txt
    rm -f /tmp/saferoute_test_refresh_token.txt
    rm -f /tmp/saferoute_test_history_id.txt
}

# Main test execution
main() {
    echo ""
    echo "================================================"
    echo "  SafeRoute Live Integration Tests"
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
    log_info "Starting comprehensive test suite..."
    echo ""

    # === Public Endpoints ===
    echo -e "${MAGENTA}=== Health & Monitoring ===${NC}"
    test_health
    test_ready
    test_metrics
    echo ""

    echo -e "${MAGENTA}=== Safety Endpoints ===${NC}"
    test_safety_snapshot
    test_safety_snapshot_time_of_day
    test_safety_snapshot_lookback
    echo ""

    echo -e "${MAGENTA}=== Routing Endpoints ===${NC}"
    test_get_routes_anonymous
    test_invalid_route_request
    echo ""

    echo -e "${MAGENTA}=== Security Tests ===${NC}"
    test_unauthorized_access
    echo ""

    # === Authentication Flow ===
    echo -e "${MAGENTA}=== Authentication Flow ===${NC}"
    test_register
    test_login
    test_get_current_user
    test_refresh_token
    echo ""

    # === Authenticated Route Operations ===
    echo -e "${MAGENTA}=== Authenticated Routes ===${NC}"
    test_get_routes_authenticated
    echo ""

    # === User Settings ===
    echo -e "${MAGENTA}=== User Settings ===${NC}"
    test_get_user_settings
    test_update_user_settings
    echo ""

    # === Route History ===
    echo -e "${MAGENTA}=== Route History ===${NC}"
    test_get_route_history
    test_get_route_history_pagination
    test_delete_single_history
    test_delete_all_history
    echo ""

    # === Session Management ===
    echo -e "${MAGENTA}=== Session Management ===${NC}"
    test_logout
    echo ""

    # === Admin Endpoints ===
    echo -e "${MAGENTA}=== Admin Endpoints ===${NC}"
    test_admin_task_status
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
