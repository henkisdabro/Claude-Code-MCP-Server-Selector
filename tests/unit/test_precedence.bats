#!/usr/bin/env bats

# Test suite for MCP Server Selector precedence resolution

setup() {
    TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" && pwd )"
    PROJECT_ROOT="$TEST_DIR/../.."
    FIXTURES_DIR="$TEST_DIR/../fixtures"

    # Create temporary test environment
    export TEST_HOME=$(mktemp -d)
    export TEST_PROJECT=$(mktemp -d)
    export HOME="$TEST_HOME"

    mkdir -p "$TEST_HOME/.claude"
    mkdir -p "$TEST_PROJECT/.claude"

    # Change to test project directory
    cd "$TEST_PROJECT"
}

teardown() {
    rm -rf "$TEST_HOME"
    rm -rf "$TEST_PROJECT"
}

@test "scope priority: local > project > user" {
    # User scope: fetch enabled
    echo '{"enabledMcpjsonServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"

    # Project scope: fetch disabled
    echo '{"disabledMcpjsonServers": ["fetch"]}' > "$TEST_PROJECT/.claude/settings.json"

    # Define fetch in user .mcp.json
    echo '{"mcpServers": {"fetch": {"command": "test"}}}' > "$TEST_HOME/.mcp.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --debug-precedence fetch
    [ "$status" -eq 0 ]
    [[ "$output" =~ "disable" ]] || [[ "$output" =~ "DISABLED" ]]
}

@test "local scope overrides project scope" {
    # Project scope: fetch disabled
    echo '{"disabledMcpjsonServers": ["fetch"]}' > "$TEST_PROJECT/.claude/settings.json"

    # Local scope: fetch enabled
    echo '{"enabledMcpjsonServers": ["fetch"]}' > "$TEST_PROJECT/.claude/settings.local.json"

    # Define fetch
    echo '{"mcpServers": {"fetch": {"command": "test"}}}' > "$TEST_HOME/.mcp.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --debug-precedence fetch
    [ "$status" -eq 0 ]
    [[ "$output" =~ "ENABLED" ]] || [[ "$output" =~ "enable" ]]
}

@test "server definition from higher priority scope wins" {
    # User scope: fetch with args1
    echo '{"mcpServers": {"fetch": {"command": "user-cmd"}}}' > "$TEST_HOME/.mcp.json"

    # Project scope: fetch with args2
    echo '{"mcpServers": {"fetch": {"command": "project-cmd"}}}' > "$TEST_PROJECT/.mcp.json"

    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --debug-precedence fetch
    [ "$status" -eq 0 ]
    [[ "$output" =~ "project" ]] && [[ "$output" =~ "ACTIVE" ]]
}

@test "default state is enabled when no explicit enable/disable" {
    # Only define server, no enable/disable arrays
    echo '{"mcpServers": {"fetch": {"command": "test"}}}' > "$TEST_HOME/.mcp.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --debug-precedence fetch
    [ "$status" -eq 0 ]
    [[ "$output" =~ "Default: ENABLED" ]] || [[ "$output" =~ "ENABLED" ]]
}

@test "server not found shows error" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --debug-precedence nonexistent
    [ "$status" -eq 1 ]
    [[ "$output" =~ "not found" ]]
}

@test "runtime disabled (ORANGE) is detected" {
    # Define server
    echo '{"mcpServers": {"fetch": {"command": "test"}}}' > "$TEST_HOME/.mcp.json"

    # Add to runtime disabled list
    local cwd=$(pwd)
    cat > "$TEST_HOME/.claude.json" << EOF
{
  "projects": {
    "$cwd": {
      "disabledMcpServers": ["fetch"]
    }
  }
}
EOF

    run "$PROJECT_ROOT/mcp" --debug-precedence fetch
    [ "$status" -eq 0 ]
    [[ "$output" =~ "RUNTIME DISABLED" ]] || [[ "$output" =~ "ORANGE" ]]
}
