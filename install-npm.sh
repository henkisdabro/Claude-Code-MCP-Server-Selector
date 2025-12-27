#!/usr/bin/env bash

# Claude Code MCP Server Selector - npm Installation Script
#
# One-line install:
#   curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install-npm.sh | bash
#
# Non-interactive mode (for CI):
#   curl -fsSL ... | MCP_INSTALL_NONINTERACTIVE=1 bash
#
# This script:
#   1. Checks for Node.js 20+ and npm
#   2. Detects and removes old bash-based mcp installations
#   3. Cleans up old temporary state files
#   4. Installs the npm package globally

set -euo pipefail

# ============================================================================
# CONSTANTS
# ============================================================================

readonly PACKAGE_NAME="@henkisdabro/mcp-selector"
readonly MIN_NODE_VERSION=20

# Colour codes
readonly COLOUR_RESET='\033[0m'
readonly COLOUR_RED='\033[0;31m'
readonly COLOUR_GREEN='\033[0;32m'
readonly COLOUR_YELLOW='\033[1;33m'
readonly COLOUR_CYAN='\033[0;36m'
readonly COLOUR_WHITE='\033[1m'

# Markers
readonly MARK_ERROR="✗"
readonly MARK_SUCCESS="✓"
readonly MARK_WARNING="⚠"
readonly MARK_INFO="→"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

msg_info() {
    echo -e "${COLOUR_CYAN}${MARK_INFO}${COLOUR_RESET} $*"
}

msg_success() {
    echo -e "${COLOUR_GREEN}${MARK_SUCCESS}${COLOUR_RESET} $*"
}

msg_error() {
    echo -e "${COLOUR_RED}${MARK_ERROR}${COLOUR_RESET} $*" >&2
}

msg_warning() {
    echo -e "${COLOUR_YELLOW}${MARK_WARNING}${COLOUR_RESET} $*"
}

msg_header() {
    echo -e "${COLOUR_WHITE}${COLOUR_CYAN}$*${COLOUR_RESET}"
}

# ============================================================================
# DEPENDENCY CHECKING
# ============================================================================

check_node_version() {
    if ! command -v node &> /dev/null; then
        msg_error "Node.js is not installed"
        echo ""
        echo -e "${COLOUR_CYAN}Install Node.js 20 or later:${COLOUR_RESET}"
        echo ""
        echo "  Using nvm (recommended):"
        echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
        echo "    nvm install 20"
        echo ""
        echo "  Using Homebrew (macOS):"
        echo "    brew install node@20"
        echo ""
        echo "  Using apt (Ubuntu/Debian):"
        echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "    sudo apt-get install -y nodejs"
        echo ""
        exit 1
    fi

    local node_version
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)

    if [[ "$node_version" -lt "$MIN_NODE_VERSION" ]]; then
        msg_error "Node.js version $MIN_NODE_VERSION or later required (found: $(node -v))"
        echo ""
        echo -e "${COLOUR_CYAN}Upgrade Node.js:${COLOUR_RESET}"
        echo "  nvm install $MIN_NODE_VERSION && nvm use $MIN_NODE_VERSION"
        echo ""
        exit 1
    fi

    msg_success "Node.js $(node -v) detected"
}

check_npm() {
    if ! command -v npm &> /dev/null; then
        msg_error "npm is not installed"
        echo ""
        echo "npm should come with Node.js. Please reinstall Node.js."
        exit 1
    fi

    msg_success "npm $(npm -v) detected"
}

# ============================================================================
# MIGRATION FROM OLD BASH VERSION
# ============================================================================

# Common locations where the old bash mcp script might be installed
OLD_SCRIPT_LOCATIONS=(
    "$HOME/.local/bin/mcp"
    "$HOME/.local/bin/claudemcp"
    "/usr/local/bin/mcp"
    "/usr/local/bin/claudemcp"
    "$HOME/bin/mcp"
    "$HOME/bin/claudemcp"
)

# Non-interactive mode (set MCP_INSTALL_NONINTERACTIVE=1 for CI)
NONINTERACTIVE="${MCP_INSTALL_NONINTERACTIVE:-0}"

check_old_bash_script() {
    local location="$1"

    # Check if file exists and is a bash script (not a symlink to node)
    if [[ -f "$location" ]]; then
        # Check if it's a bash script by looking at shebang or content
        if head -1 "$location" 2>/dev/null | grep -q "bash\|#!/bin/sh"; then
            return 0  # It's the old bash script
        fi
        # Also check if it contains bash-specific patterns from old script
        if grep -q "fzf\|jq.*mcpServers\|CLAUDE_SESSION" "$location" 2>/dev/null; then
            return 0  # It's the old bash script
        fi
    fi
    return 1  # Not the old bash script
}

detect_old_installation() {
    local found_old=false
    local old_locations=()

    # Check known locations
    for location in "${OLD_SCRIPT_LOCATIONS[@]}"; do
        if check_old_bash_script "$location"; then
            old_locations+=("$location")
            found_old=true
        fi
    done

    # Also check if 'mcp' in PATH is the old bash version
    local current_mcp
    current_mcp=$(command -v mcp 2>/dev/null || true)
    if [[ -n "$current_mcp" ]] && check_old_bash_script "$current_mcp"; then
        # Avoid duplicates
        local already_found=false
        for loc in "${old_locations[@]}"; do
            if [[ "$loc" == "$current_mcp" ]]; then
                already_found=true
                break
            fi
        done
        if [[ "$already_found" == "false" ]]; then
            old_locations+=("$current_mcp")
            found_old=true
        fi
    fi

    if [[ "$found_old" == "true" ]]; then
        echo "${old_locations[@]}"
        return 0
    fi
    return 1
}

migrate_from_old_version() {
    msg_info "Checking for old bash-based mcp installation..."

    local old_locations
    if old_locations=$(detect_old_installation); then
        echo ""
        msg_warning "Found old bash-based mcp script(s):"
        for location in $old_locations; do
            echo "    $location"
        done
        echo ""
        msg_info "The new npm-based version will conflict with the old script."
        echo ""

        # Ask user for permission to remove (auto-yes in non-interactive mode)
        local response="Y"
        if [[ "$NONINTERACTIVE" != "1" ]]; then
            read -r -p "Remove old script(s) to avoid conflicts? [Y/n] " response
            response=${response:-Y}
        else
            msg_info "Non-interactive mode: automatically removing old scripts"
        fi

        if [[ "$response" =~ ^[Yy]$ ]]; then
            for location in $old_locations; do
                if [[ -w "$location" ]]; then
                    rm -f "$location"
                    msg_success "Removed: $location"
                elif [[ -w "$(dirname "$location")" ]]; then
                    rm -f "$location"
                    msg_success "Removed: $location"
                else
                    msg_warning "Cannot remove $location (permission denied)"
                    echo "    Run: sudo rm '$location'"
                fi
            done
            echo ""
        else
            msg_warning "Old script(s) not removed. You may experience conflicts."
            echo "    The old 'mcp' command may shadow the new npm version."
            echo "    Remove manually or ensure npm bin directory is first in PATH."
            echo ""
        fi
    else
        msg_success "No old bash-based installation detected"
    fi
}

cleanup_old_state_files() {
    # Old state file location (if any)
    local old_state_dir="/tmp/mcp-selector"

    if [[ -d "$old_state_dir" ]]; then
        msg_info "Cleaning up old temporary state files..."
        rm -rf "$old_state_dir"
        msg_success "Removed: $old_state_dir"
    fi
}

# ============================================================================
# INSTALLATION
# ============================================================================

install_mcp_selector() {
    msg_header "Claude Code MCP Server Selector - npm Installation"
    echo ""

    # Check Node.js version
    msg_info "Checking Node.js version..."
    check_node_version
    check_npm
    echo ""

    # Check for and migrate from old bash version
    migrate_from_old_version
    cleanup_old_state_files
    echo ""

    # Install package globally
    msg_info "Installing $PACKAGE_NAME globally..."
    echo ""

    if npm install -g "$PACKAGE_NAME"; then
        echo ""
        msg_success "Installation complete!"
    else
        echo ""
        msg_error "Installation failed"
        echo ""
        echo "If you see permission errors, try:"
        echo "  sudo npm install -g $PACKAGE_NAME"
        echo ""
        echo "Or configure npm to use a different prefix:"
        echo "  mkdir -p ~/.npm-global"
        echo "  npm config set prefix ~/.npm-global"
        echo "  export PATH=~/.npm-global/bin:\$PATH"
        echo "  npm install -g $PACKAGE_NAME"
        exit 1
    fi

    echo ""
    echo -e "${COLOUR_CYAN}Usage:${COLOUR_RESET}"
    echo -e "  Run ${COLOUR_WHITE}mcp${COLOUR_RESET} or ${COLOUR_WHITE}claudemcp${COLOUR_RESET} in any directory with a Claude project"
    echo ""
    echo -e "${COLOUR_CYAN}Commands:${COLOUR_RESET}"
    echo -e "  ${COLOUR_GREEN}mcp${COLOUR_RESET}                    Launch interactive TUI"
    echo -e "  ${COLOUR_GREEN}mcp enable <servers>${COLOUR_RESET}   Enable specific servers"
    echo -e "  ${COLOUR_GREEN}mcp disable <servers>${COLOUR_RESET}  Disable specific servers"
    echo -e "  ${COLOUR_GREEN}mcp audit${COLOUR_RESET}              Check configuration health"
    echo -e "  ${COLOUR_GREEN}mcp context-report${COLOUR_RESET}     Show configuration summary"
    echo -e "  ${COLOUR_GREEN}mcp --help${COLOUR_RESET}             Show all commands"
    echo ""
    echo -e "${COLOUR_CYAN}TUI Shortcuts:${COLOUR_RESET}"
    echo -e "  • ${COLOUR_GREEN}SPACE${COLOUR_RESET}   - Toggle server (3-way: on/paused/off)"
    echo -e "  • ${COLOUR_GREEN}ENTER${COLOUR_RESET}   - Save and exit"
    echo -e "  • ${COLOUR_GREEN}ESC${COLOUR_RESET}     - Cancel without saving"
    echo -e "  • ${COLOUR_GREEN}i${COLOUR_RESET}       - Install new plugin from marketplace"
    echo -e "  • ${COLOUR_GREEN}ALT-E${COLOUR_RESET}   - Enable all servers"
    echo -e "  • ${COLOUR_GREEN}ALT-D${COLOUR_RESET}   - Disable all servers"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

install_mcp_selector
