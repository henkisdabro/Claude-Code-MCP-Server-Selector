#!/usr/bin/env bats

# Test suite for MCP Server Selector audit functionality

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

@test "validate command passes with valid JSON files" {
    # Create valid config files
    echo '{}' > "$TEST_HOME/.claude.json"
    echo '{}' > "$TEST_HOME/.claude/settings.json"

    run "$PROJECT_ROOT/mcp" --validate
    [ "$status" -eq 0 ]
    [[ "$output" =~ "Validation PASSED" ]]
}

@test "validate command fails with invalid JSON" {
    # Create invalid JSON file
    echo '{invalid json' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --validate
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Invalid JSON" ]]
}

@test "audit detects disabledMcpServers in wrong location" {
    # Create settings file with disabledMcpServers (wrong location)
    mkdir -p "$TEST_HOME/.claude"
    echo '{"disabledMcpServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit
    [ "$status" -eq 1 ]
    [[ "$output" =~ "disabledMcpServers in wrong location" ]]
}

@test "audit passes with correct configuration" {
    # Create correct config files
    echo '{}' > "$TEST_HOME/.claude.json"
    echo '{"enabledMcpjsonServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"

    run "$PROJECT_ROOT/mcp" --audit
    [ "$status" -eq 0 ]
    [[ "$output" =~ "ALL CHECKS PASSED" ]]
}

@test "audit JSON output is valid JSON" {
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    [ "$status" -eq 0 ]

    # Verify output is valid JSON
    echo "$output" | jq empty
    [ "$?" -eq 0 ]
}

@test "audit detects plugin with explicit false" {
    mkdir -p "$TEST_HOME/.claude"
    echo '{"enabledPlugins": {"mcp-fetch@marketplace": false}}' > "$TEST_HOME/.claude/settings.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit
    [[ "$output" =~ "set to explicit false" ]]
}

@test "help command shows usage" {
    run "$PROJECT_ROOT/mcp" --help
    [ "$status" -eq 0 ]
    [[ "$output" =~ "MCP Server Selector" ]]
    [[ "$output" =~ "--audit" ]]
    [[ "$output" =~ "--validate" ]]
}

@test "version command shows version" {
    run "$PROJECT_ROOT/mcp" --version
    [ "$status" -eq 0 ]
    [[ "$output" =~ "MCP Server Selector v" ]]
}

@test "debug-precedence requires server name" {
    run "$PROJECT_ROOT/mcp" --debug-precedence
    [ "$status" -eq 1 ]
    [[ "$output" =~ "requires a server name" ]]
}

@test "restore-plugin requires plugin name" {
    run "$PROJECT_ROOT/mcp" --restore-plugin
    [ "$status" -eq 1 ]
    [[ "$output" =~ "requires a plugin name" ]]
}

@test "unknown option shows error" {
    run "$PROJECT_ROOT/mcp" --unknown-option
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Unknown option" ]]
}
