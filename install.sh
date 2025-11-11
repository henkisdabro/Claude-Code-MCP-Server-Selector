#!/usr/bin/env bash

# Claude Code MCP Server Selector - Installation Script
# One-line install: curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install.sh | bash

set -euo pipefail

# ============================================================================
# CONSTANTS
# ============================================================================

readonly REPO_URL="https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector.git"
readonly INSTALL_DIR="$HOME/.config/mcp-selector"
readonly BIN_DIR="$HOME/.local/bin"
readonly SYMLINK_MCP="$BIN_DIR/mcp"
readonly SYMLINK_CLAUDEMCP="$BIN_DIR/claudemcp"

# Color codes
readonly COLOR_RESET='\033[0m'
readonly COLOR_RED='\033[0;31m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[1;33m'
readonly COLOR_CYAN='\033[0;36m'
readonly COLOR_WHITE='\033[1m'

# Markers
readonly MARK_ERROR="✗"
readonly MARK_SUCCESS="✓"
readonly MARK_WARNING="⚠"
readonly MARK_INFO="→"

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

msg_info() {
    echo -e "${COLOR_CYAN}${MARK_INFO}${COLOR_RESET} $*"
}

msg_success() {
    echo -e "${COLOR_GREEN}${MARK_SUCCESS}${COLOR_RESET} $*"
}

msg_error() {
    echo -e "${COLOR_RED}${MARK_ERROR}${COLOR_RESET} $*" >&2
}

msg_warning() {
    echo -e "${COLOR_YELLOW}${MARK_WARNING}${COLOR_RESET} $*"
}

msg_header() {
    echo -e "${COLOR_WHITE}${COLOR_CYAN}$*${COLOR_RESET}"
}

detect_os() {
    # Check if running on Windows (Git Bash, MSYS, Cygwin, WSL)
    if [[ -n "${MSYSTEM:-}" ]] || [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$(uname -s)" == CYGWIN* ]]; then
        echo "Windows"
    elif grep -qi microsoft /proc/version 2>/dev/null; then
        echo "WSL"
    else
        uname -s
    fi
}

detect_user_shell() {
    if [[ -n "${SHELL:-}" ]]; then
        basename "$SHELL"
    else
        echo "bash"  # Fallback
    fi
}

get_shell_config() {
    local shell
    shell=$(detect_user_shell)

    case "$shell" in
        zsh)
            echo "$HOME/.zshrc"
            ;;
        bash)
            if [[ -f "$HOME/.bashrc" ]]; then
                echo "$HOME/.bashrc"
            else
                echo "$HOME/.bash_profile"
            fi
            ;;
        fish)
            echo "$HOME/.config/fish/config.fish"
            ;;
        *)
            echo "$HOME/.profile"
            ;;
    esac
}

add_to_path() {
    local shell_config
    shell_config=$(get_shell_config)
    local shell
    shell=$(detect_user_shell)

    # Create backup
    if [[ -f "$shell_config" ]]; then
        local backup="${shell_config}.backup-$(date +%s)"
        cp "$shell_config" "$backup"
        msg_info "Created backup: $backup"
    fi

    # Check if PATH export already exists
    if [[ -f "$shell_config" ]] && grep -q "export PATH=.*$BIN_DIR" "$shell_config" 2>/dev/null; then
        msg_warning "PATH export already exists in $shell_config"
        return 0
    fi

    # Add PATH export based on shell type
    if [[ "$shell" == "fish" ]]; then
        # Fish shell syntax
        echo "" >> "$shell_config"
        echo "# Added by MCP Selector installer" >> "$shell_config"
        echo "set -gx PATH \"\$HOME/.local/bin\" \$PATH" >> "$shell_config"
    else
        # Bash/Zsh/POSIX syntax
        echo "" >> "$shell_config"
        echo "# Added by MCP Selector installer" >> "$shell_config"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$shell_config"
    fi

    msg_success "Added $BIN_DIR to PATH in $shell_config"
    echo ""
    echo -e "${COLOR_YELLOW}Reload your shell:${COLOR_RESET}"
    if [[ "$shell" == "fish" ]]; then
        echo "  source $shell_config"
    else
        echo "  source $shell_config"
    fi
}

# ============================================================================
# DEPENDENCY CHECKING
# ============================================================================

check_dependencies() {
    local missing_deps=()
    local os
    os=$(detect_os)

    # Check for git, fzf, jq
    for cmd in git fzf jq; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    if [[ ${#missing_deps[@]} -eq 0 ]]; then
        return 0
    fi

    msg_error "Missing required dependencies: ${missing_deps[*]}"
    echo ""

    case "$os" in
        Windows)
            msg_info "Git Bash/MSYS detected on Windows"
            echo ""
            echo -e "${COLOR_CYAN}Windows Installation Options:${COLOR_RESET}"
            echo ""

            # Option 1: Chocolatey
            if command -v choco &> /dev/null; then
                echo -e "${COLOR_GREEN}Option 1: Using Chocolatey (detected)${COLOR_RESET}"
                echo "  choco install ${missing_deps[*]}"
                echo ""
            else
                echo -e "${COLOR_CYAN}Option 1: Using Chocolatey${COLOR_RESET}"
                echo "  First install Chocolatey from: https://chocolatey.org/install"
                echo "  Then run: choco install ${missing_deps[*]}"
                echo ""
            fi

            # Option 2: Scoop
            if command -v scoop &> /dev/null; then
                echo -e "${COLOR_GREEN}Option 2: Using Scoop (detected)${COLOR_RESET}"
                echo "  scoop install ${missing_deps[*]}"
                echo ""
            else
                echo -e "${COLOR_CYAN}Option 2: Using Scoop${COLOR_RESET}"
                echo "  First install Scoop from: https://scoop.sh"
                echo "  Then run: scoop install ${missing_deps[*]}"
                echo ""
            fi

            # Option 3: Manual
            echo -e "${COLOR_CYAN}Option 3: Manual Installation${COLOR_RESET}"
            for dep in "${missing_deps[@]}"; do
                case "$dep" in
                    fzf)
                        echo "  fzf: Download from https://github.com/junegunn/fzf/releases"
                        echo "       Extract and add to PATH"
                        ;;
                    jq)
                        echo "  jq:  Download from https://jqlang.github.io/jq/download/"
                        echo "       Rename to jq.exe and add to PATH"
                        ;;
                    git)
                        echo "  git: Download from https://git-scm.com/download/win"
                        ;;
                esac
            done
            echo ""
            msg_warning "After installation, restart Git Bash and re-run this installer"
            ;;
        WSL)
            msg_info "WSL detected - using Linux package manager"
            echo ""

            if command -v apt &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo apt update && sudo apt install ${missing_deps[*]}"
            elif command -v dnf &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo dnf install ${missing_deps[*]}"
            elif command -v yum &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo yum install ${missing_deps[*]}"
            elif command -v pacman &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo pacman -S ${missing_deps[*]}"
            elif command -v zypper &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo zypper install ${missing_deps[*]}"
            elif command -v apk &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo apk add ${missing_deps[*]}"
            else
                echo -e "${COLOR_CYAN}Install using your Linux distribution's package manager${COLOR_RESET}"
            fi
            ;;
        Linux)
            if command -v apt &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo apt update && sudo apt install ${missing_deps[*]}"
            elif command -v dnf &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo dnf install ${missing_deps[*]}"
            elif command -v yum &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo yum install ${missing_deps[*]}"
            elif command -v pacman &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo pacman -S ${missing_deps[*]}"
            elif command -v zypper &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo zypper install ${missing_deps[*]}"
            elif command -v apk &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  sudo apk add ${missing_deps[*]}"
            elif command -v nix-env &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  nix-env -iA nixpkgs.${missing_deps[0]}"
                [[ ${#missing_deps[@]} -gt 1 ]] && echo "  # Install other packages: ${missing_deps[*]:1}"
            else
                echo -e "${COLOR_CYAN}Install using your system's package manager${COLOR_RESET}"
            fi
            ;;
        Darwin)
            if command -v brew &> /dev/null; then
                echo -e "${COLOR_CYAN}Install with:${COLOR_RESET}"
                echo "  brew install ${missing_deps[*]}"
            else
                echo -e "${COLOR_CYAN}Install Homebrew first:${COLOR_RESET}"
                echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                echo ""
                echo -e "${COLOR_CYAN}Then install dependencies:${COLOR_RESET}"
                echo "  brew install ${missing_deps[*]}"
            fi
            ;;
        *)
            echo -e "${COLOR_CYAN}Please install: ${missing_deps[*]}${COLOR_RESET}"
            ;;
    esac

    exit 1
}

# ============================================================================
# INSTALLATION
# ============================================================================

install_mcp_selector() {
    msg_header "Claude Code MCP Server Selector - Installation"
    echo ""

    # Check dependencies
    msg_info "Checking dependencies..."
    check_dependencies
    msg_success "All dependencies found"
    echo ""

    # Remove existing installation if present
    if [[ -d "$INSTALL_DIR" ]]; then
        msg_warning "Removing existing installation at $INSTALL_DIR"
        rm -rf "$INSTALL_DIR"
    fi

    # Clone repository
    msg_info "Cloning repository..."
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" 2>&1 | grep -v "Cloning into" || true
    msg_success "Repository cloned to $INSTALL_DIR"
    echo ""

    # Create bin directory if it doesn't exist
    if [[ ! -d "$BIN_DIR" ]]; then
        msg_info "Creating $BIN_DIR"
        mkdir -p "$BIN_DIR"
    fi

    # Remove existing symlinks if present
    for symlink in "$SYMLINK_MCP" "$SYMLINK_CLAUDEMCP"; do
        if [[ -L "$symlink" ]] || [[ -f "$symlink" ]]; then
            msg_warning "Removing existing symlink at $symlink"
            rm -f "$symlink"
        fi
    done

    # Create symlinks
    msg_info "Creating symlinks..."
    chmod +x "$INSTALL_DIR/mcp"
    ln -s "$INSTALL_DIR/mcp" "$SYMLINK_MCP"
    ln -s "$INSTALL_DIR/mcp" "$SYMLINK_CLAUDEMCP"
    msg_success "Symlinks created:"
    echo -e "  ${COLOR_CYAN}mcp${COLOR_RESET}       → $INSTALL_DIR/mcp"
    echo -e "  ${COLOR_CYAN}claudemcp${COLOR_RESET} → $INSTALL_DIR/mcp"
    echo ""

    # Check if BIN_DIR is in PATH
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        msg_warning "$BIN_DIR is not in your PATH"
        echo ""
        echo "Would you like to automatically add it to your shell configuration?"
        echo ""

        local response
        read -rp "Add $BIN_DIR to PATH? (Y/n): " response

        if [[ "$response" =~ ^[Nn]$ ]]; then
            # User declined, show manual instructions
            echo ""
            msg_info "Manual setup instructions:"
            echo ""
            local shell_config
            shell_config=$(get_shell_config)
            local shell
            shell=$(detect_user_shell)

            if [[ "$shell" == "fish" ]]; then
                echo "  Add this to $shell_config:"
                echo -e "  ${COLOR_CYAN}set -gx PATH \"\$HOME/.local/bin\" \$PATH${COLOR_RESET}"
            else
                echo "  Add this to $shell_config:"
                echo -e "  ${COLOR_CYAN}export PATH=\"\$HOME/.local/bin:\$PATH\"${COLOR_RESET}"
            fi
            echo ""
            echo "  Then reload:"
            echo -e "  ${COLOR_CYAN}source $shell_config${COLOR_RESET}"
            echo ""
        else
            # User accepted, add automatically
            echo ""
            add_to_path
            echo ""
        fi
    fi

    # Success message
    msg_success "Installation complete!"
    echo ""
    echo -e "${COLOR_CYAN}Usage:${COLOR_RESET}"
    echo -e "  Run ${COLOR_WHITE}mcp${COLOR_RESET} or ${COLOR_WHITE}claudemcp${COLOR_RESET} in any directory with a Claude project"
    echo ""
    echo -e "${COLOR_CYAN}Workflow:${COLOR_RESET}"
    echo -e "  1. Launch the selector with ${COLOR_WHITE}mcp${COLOR_RESET} or ${COLOR_WHITE}claudemcp${COLOR_RESET}"
    echo -e "  2. Use ${COLOR_GREEN}SPACE${COLOR_RESET} to toggle servers on/off"
    echo -e "  3. Press ${COLOR_GREEN}ENTER${COLOR_RESET} to save and automatically launch Claude Code"
    echo ""
    echo -e "${COLOR_CYAN}Additional Features:${COLOR_RESET}"
    echo -e "  • ${COLOR_GREEN}Ctrl-A${COLOR_RESET} - Add new server"
    echo -e "  • ${COLOR_GREEN}Ctrl-X${COLOR_RESET} - Remove server"
    echo -e "  • ${COLOR_GREEN}Alt-E${COLOR_RESET} - Enable all servers"
    echo -e "  • ${COLOR_GREEN}Alt-D${COLOR_RESET} - Disable all servers"
    echo -e "  • ${COLOR_GREEN}ESC${COLOR_RESET} - Cancel without saving"
    echo ""
}

# ============================================================================
# MAIN
# ============================================================================

install_mcp_selector
