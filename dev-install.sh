#!/usr/bin/env bash

# Local Development Install Script
# Creates symlinks to local version for testing

set -e

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BIN_DIR="$HOME/.local/bin"
readonly SYMLINK_MCP="$BIN_DIR/mcp"
readonly SYMLINK_CLAUDEMCP="$BIN_DIR/claudemcp"

# Color codes
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_RESET='\033[0m'

echo -e "${COLOR_CYAN}Installing local development version...${COLOR_RESET}"
echo ""

# Make script executable
chmod +x "$SCRIPT_DIR/mcp"
echo -e "${COLOR_GREEN}✓${COLOR_RESET} Made script executable"

# Create bin directory if needed
mkdir -p "$BIN_DIR"
echo -e "${COLOR_GREEN}✓${COLOR_RESET} Ensured $BIN_DIR exists"

# Create symlinks (force overwrite if they exist)
ln -sf "$SCRIPT_DIR/mcp" "$SYMLINK_MCP"
ln -sf "$SCRIPT_DIR/mcp" "$SYMLINK_CLAUDEMCP"
echo -e "${COLOR_GREEN}✓${COLOR_RESET} Created symlinks"

echo ""
echo -e "${COLOR_GREEN}✓ Local development version installed${COLOR_RESET}"
echo ""
echo -e "Symlinks point to: ${COLOR_CYAN}$SCRIPT_DIR/mcp${COLOR_RESET}"
echo ""
echo -e "${COLOR_YELLOW}Note:${COLOR_RESET} To switch back to production, run:"
echo -e "  ${COLOR_CYAN}curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install.sh | bash${COLOR_RESET}"
echo ""
