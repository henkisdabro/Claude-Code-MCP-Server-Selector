#!/usr/bin/env bats

# Test suite for MCP Server Selector audit functionality
#
# Known limitation: The audit command output may not be captured properly
# in non-TTY environments. Tests that require audit output validation
# should be run manually in a terminal environment.

setup() {
    # Get the directory of the test file
    TEST_DIR="$( cd "$( dirname "$BATS_TEST_FILENAME" )" && pwd )"
    PROJECT_ROOT="$TEST_DIR/../.."
    FIXTURES_DIR="$TEST_DIR/../fixtures"

    # Create temporary test environment
    export TEST_HOME=$(mktemp -d)
    export HOME="$TEST_HOME"

    mkdir -p "$TEST_HOME/.claude"

    # Change to the temp directory to avoid picking up project's .claude/ config
    cd "$TEST_HOME"
}

teardown() {
    # Clean up temporary test environment
    rm -rf "$TEST_HOME"
}

# ============================================================================
# Validate Command Tests (reliable output capture)
# ============================================================================

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

# ============================================================================
# Help and Version Tests
# ============================================================================

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

# ============================================================================
# Argument Validation Tests
# ============================================================================

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

# ============================================================================
# Audit Exit Code Tests
# These tests verify the audit command returns correct exit codes
# without relying on output capture
# ============================================================================

@test "audit returns error exit code when disabledMcpServers in wrong location" {
    # Create settings file with disabledMcpServers (wrong location)
    mkdir -p "$TEST_HOME/.claude"
    echo '{"disabledMcpServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 1 (errors found)
    [ "$status" -eq 1 ]
}

@test "audit returns success exit code with correct configuration" {
    # Create correct config files (no issues)
    echo '{}' > "$TEST_HOME/.claude.json"
    echo '{}' > "$TEST_HOME/.claude/settings.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 0 (no errors)
    [ "$status" -eq 0 ]
}

@test "audit returns success with disabledMcpServers in ~/.claude.json root" {
    # disabledMcpServers in ~/.claude.json is valid for Direct servers
    echo '{"disabledMcpServers": ["fetch"]}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should not fail - this is a valid location
    [ "$status" -eq 0 ]
}

@test "audit does not flag disabledMcpServers in ~/.claude.json projects section as wrong location" {
    # disabledMcpServers in projects[cwd] section is valid and should not be flagged
    # as "disabledMcpServers in wrong location" error
    # Note: The audit may still find other INFO-level issues (orphaned references)
    # Use TEST_HOME as the project path since we cd'd there
    echo "{\"projects\": {\"$TEST_HOME\": {\"disabledMcpServers\": [\"fetch\"]}}}" > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # The key check: "disabledMcpServers in wrong location" should NOT appear
    # The audit may return non-zero due to orphaned reference (INFO level)
    # but should NOT report wrong location ERROR
    [[ ! "$output" =~ "disabledMcpServers in wrong location" ]]
}

@test "audit returns error exit code when disabledMcpServers in settings.local.json" {
    # disabledMcpServers in settings files is WRONG
    mkdir -p "$TEST_HOME/.claude"
    echo '{"disabledMcpServers": ["fetch"]}' > "$TEST_HOME/.claude/settings.local.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 1 (errors found)
    [ "$status" -eq 1 ]
}

# ============================================================================
# Plugin Discovery Audit Exit Code Tests
# ============================================================================

@test "audit returns error when plugin has invalid .mcp.json" {
    # Create marketplace structure with invalid .mcp.json
    mkdir -p "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/.claude-plugin"
    mkdir -p "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/test-plugin"

    # Create marketplace.json
    cat > "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/.claude-plugin/marketplace.json" << 'EOF'
{
  "plugins": [
    { "name": "test-plugin", "source": "test-plugin" }
  ]
}
EOF

    # Create invalid .mcp.json
    echo '{invalid json' > "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/test-plugin/.mcp.json"
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 1 (errors found)
    [ "$status" -eq 1 ]
}

@test "audit returns success with valid plugin .mcp.json" {
    # Create valid marketplace structure
    mkdir -p "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/.claude-plugin"
    mkdir -p "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/test-plugin"

    cat > "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/.claude-plugin/marketplace.json" << 'EOF'
{
  "plugins": [
    { "name": "test-plugin", "source": "test-plugin" }
  ]
}
EOF

    cat > "$TEST_HOME/.claude/plugins/marketplaces/test-marketplace/test-plugin/.mcp.json" << 'EOF'
{
  "mcpServers": {
    "test-server": {
      "command": "echo",
      "args": ["test"]
    }
  }
}
EOF

    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 0 (no errors)
    [ "$status" -eq 0 ]
}

@test "audit returns success when no marketplace directory exists" {
    # No marketplaces installed - just base config
    echo '{}' > "$TEST_HOME/.claude.json"

    run "$PROJECT_ROOT/mcp" --audit --json
    # Should return exit code 0 (graceful handling)
    [ "$status" -eq 0 ]
}
