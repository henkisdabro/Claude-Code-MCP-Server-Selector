#!/usr/bin/env bats

# Test suite for MCP Server Selector enable/disable commands

setup() {
    # Get the directory of the test file
    TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" && pwd )"
    PROJECT_ROOT="$TEST_DIR/../.."
    FIXTURES_DIR="$TEST_DIR/../fixtures"

    # Create temporary test environment
    export TEST_HOME=$(mktemp -d)
    export HOME="$TEST_HOME"

    mkdir -p "$TEST_HOME/.claude"
}

teardown() {
    # Clean up temporary test environment
    rm -rf "$TEST_HOME"
}

# =============================================================================
# Enable Command Tests
# =============================================================================

@test "enable requires at least one server or --all" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable
    [ "$status" -eq 1 ]
    [[ "$output" =~ "No servers specified" ]]
}

@test "enable with nonexistent server reports failure" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable nonexistent-server
    [ "$status" -eq 0 ]
    [[ "$output" =~ "not found" ]]
}

@test "enable --json outputs valid JSON" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable --json nonexistent-server
    [ "$status" -eq 0 ]

    # Verify output is valid JSON
    echo "$output" | jq empty
    [ "$?" -eq 0 ]
}

@test "enable --json includes enabled count and failed array" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable --json nonexistent-server
    [ "$status" -eq 0 ]

    # Check JSON structure
    enabled=$(echo "$output" | jq '.enabled')
    [ "$enabled" = "0" ]

    failed_count=$(echo "$output" | jq '.failed | length')
    [ "$failed_count" = "1" ]
}

@test "enable --quiet suppresses output" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable --quiet --all
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# =============================================================================
# Disable Command Tests
# =============================================================================

@test "disable requires at least one server or --all" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable
    [ "$status" -eq 1 ]
    [[ "$output" =~ "No servers specified" ]]
}

@test "disable with nonexistent server reports failure" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable nonexistent-server
    [ "$status" -eq 0 ]
    [[ "$output" =~ "not found" ]]
}

@test "disable --json outputs valid JSON" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable --json nonexistent-server
    [ "$status" -eq 0 ]

    # Verify output is valid JSON
    echo "$output" | jq empty
    [ "$?" -eq 0 ]
}

@test "disable --json includes disabled count and failed array" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable --json nonexistent-server
    [ "$status" -eq 0 ]

    # Check JSON structure
    disabled=$(echo "$output" | jq '.disabled')
    [ "$disabled" = "0" ]

    failed_count=$(echo "$output" | jq '.failed | length')
    [ "$failed_count" = "1" ]
}

@test "disable --quiet suppresses output" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable --quiet --all
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

# =============================================================================
# Enable with Real Server Tests
# =============================================================================

@test "enable works with mcpjson server" {
    # Set up disabled mcpjson server
    mkdir -p "$TEST_HOME/.claude"
    echo '{"mcpServers": {"fetch": {"command": "uvx", "args": ["mcp-server-fetch"]}}}' > "$TEST_HOME/.mcp.json"
    echo '{"disabledMcpjsonServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable --json fetch
    [ "$status" -eq 0 ]

    enabled=$(echo "$output" | jq '.enabled')
    [ "$enabled" = "1" ]
}

@test "disable works with mcpjson server" {
    # Set up enabled mcpjson server
    mkdir -p "$TEST_HOME/.claude"
    echo '{"mcpServers": {"fetch": {"command": "uvx", "args": ["mcp-server-fetch"]}}}' > "$TEST_HOME/.mcp.json"
    echo '{"enabledMcpjsonServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable --json fetch
    [ "$status" -eq 0 ]

    disabled=$(echo "$output" | jq '.disabled')
    [ "$disabled" = "1" ]
}

# =============================================================================
# Multiple Server Tests
# =============================================================================

@test "enable handles multiple servers" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" enable --json server1 server2 server3
    [ "$status" -eq 0 ]

    # All should be reported as not found
    failed_count=$(echo "$output" | jq '.failed | length')
    [ "$failed_count" = "3" ]
}

@test "disable handles multiple servers" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" disable --json server1 server2 server3
    [ "$status" -eq 0 ]

    # All should be reported as not found
    failed_count=$(echo "$output" | jq '.failed | length')
    [ "$failed_count" = "3" ]
}

# =============================================================================
# Help Integration Tests
# =============================================================================

@test "help shows enable command" {
    run "$PROJECT_ROOT/mcp" --help
    [ "$status" -eq 0 ]
    [[ "$output" =~ "mcp enable SERVER" ]]
}

@test "help shows disable command" {
    run "$PROJECT_ROOT/mcp" --help
    [ "$status" -eq 0 ]
    [[ "$output" =~ "mcp disable SERVER" ]]
}

@test "help shows --all flag for enable/disable" {
    run "$PROJECT_ROOT/mcp" --help
    [ "$status" -eq 0 ]
    [[ "$output" =~ "enable --all" ]]
    [[ "$output" =~ "disable --all" ]]
}
