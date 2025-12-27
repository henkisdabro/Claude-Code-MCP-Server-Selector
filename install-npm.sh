#!/usr/bin/env bash

# Claude Code MCP Server Selector - npm Installation Script
# One-line install: curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install-npm.sh | bash

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
    echo -e "  • ${COLOUR_GREEN}ALT-E${COLOUR_RESET}   - Enable all servers"
    echo -e "  • ${COLOUR_GREEN}ALT-D${COLOUR_RESET}   - Disable all servers"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

install_mcp_selector
