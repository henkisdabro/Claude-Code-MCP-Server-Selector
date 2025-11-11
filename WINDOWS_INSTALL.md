# Windows Installation Guide

This guide will help you install and use the Claude Code MCP Server Selector on Windows.

## Two Versions Available

### **Option 1: Native PowerShell Version** (Recommended for Windows) ⭐

**NEW!** A native PowerShell implementation with zero external dependencies (uses built-in Out-GridView).

**Advantages:**
- ✅ No Git Bash required
- ✅ No external dependencies (fzf/jq not needed)
- ✅ Native Windows experience
- ✅ Works with PowerShell 7+
- ✅ Same configuration files as bash version

**Installation:**
```powershell
# Clone the repository
git clone https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector.git
cd Claude-Code-MCP-Server-Selector/src/powershell

# Run the installer
.\install.ps1
```

**Usage:**
```powershell
mcp        # Launch selector
```

See [PowerShell Installation](#powershell-native-version) below for details.

### **Option 2: Bash Version** (via Git Bash)

The original bash-based tool that requires a bash environment and two dependencies: `fzf` and `jq`.

## Recommended Setup: Git Bash

**Git Bash** is the easiest and most common way to run bash scripts on Windows. Most developers already have it installed.

### Step 1: Install Git for Windows (if not already installed)

1. Download from: https://git-scm.com/download/win
2. Run the installer with default settings
3. Git Bash will be included automatically

### Step 2: Install Dependencies

You have three options for installing `fzf` and `jq`:

#### Option A: Using Chocolatey (Recommended)

**Chocolatey** is a popular Windows package manager that makes installation easy.

1. **Install Chocolatey** (if not already installed):
   - Open PowerShell **as Administrator**
   - Run:
     ```powershell
     Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
     ```
   - Close and reopen PowerShell as Administrator

2. **Install fzf and jq**:
   ```powershell
   choco install fzf jq
   ```

3. **Verify installation**:
   - Open **Git Bash** (not PowerShell)
   - Run:
     ```bash
     fzf --version
     jq --version
     ```

#### Option B: Using Scoop

**Scoop** is another popular Windows package manager, designed for developer tools.

1. **Install Scoop** (if not already installed):
   - Open PowerShell (regular user, not admin)
   - Run:
     ```powershell
     Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
     Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
     ```

2. **Install fzf and jq**:
   ```powershell
   scoop install fzf jq
   ```

3. **Verify installation**:
   - Open **Git Bash**
   - Run:
     ```bash
     fzf --version
     jq --version
     ```

#### Option C: Manual Installation

If you prefer not to use package managers:

**fzf:**
1. Download the latest Windows release from: https://github.com/junegunn/fzf/releases
2. Look for `fzf-X.XX.X-windows_amd64.zip`
3. Extract `fzf.exe`
4. Add to your PATH:
   - Move `fzf.exe` to `C:\Program Files\Git\usr\bin\` (if using Git Bash)
   - Or add the folder containing `fzf.exe` to your Windows PATH

**jq:**
1. Download from: https://jqlang.github.io/jq/download/
2. Look for `jq-windows-amd64.exe`
3. Rename to `jq.exe`
4. Add to your PATH:
   - Move `jq.exe` to `C:\Program Files\Git\usr\bin\` (if using Git Bash)
   - Or add the folder containing `jq.exe` to your Windows PATH

### Step 3: Install MCP Server Selector

Open **Git Bash** and run the one-line installer:

```bash
curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install.sh | bash
```

The installer will:
- Check that `fzf` and `jq` are installed
- Clone the repository to `~/.config/mcp-selector`
- Create symlinks in `~/.local/bin`
- Add `~/.local/bin` to your PATH

### Step 4: Verify Installation

1. Close and reopen Git Bash (to reload PATH)
2. Run:
   ```bash
   mcp --version
   ```

If you see version information, installation was successful!

## Alternative: WSL (Windows Subsystem for Linux)

If you use WSL, you can install the tool as if you were on Linux:

```bash
# In WSL terminal
sudo apt update && sudo apt install fzf jq git
curl -fsSL https://raw.githubusercontent.com/henkisdabro/Claude-Code-MCP-Server-Selector/main/install.sh | bash
```

**Important**: Claude Code must be accessible from WSL for this to work.

## Usage on Windows

Once installed, use the tool exactly as on Linux/macOS:

```bash
# In Git Bash (or WSL)
cd /c/Users/YourName/your-project  # Git Bash path format
mcp
```

Or if using WSL:

```bash
cd /mnt/c/Users/YourName/your-project
mcp
```

### Git Bash Path Tips

In Git Bash, Windows drives are accessed differently:
- `C:\Users` becomes `/c/Users`
- `D:\Projects` becomes `/d/Projects`

You can also use tab-completion to navigate.

## Troubleshooting

### "command not found: fzf" or "command not found: jq"

**Solution**: The dependencies are not in your PATH.

1. **Verify installation location**:
   - In Git Bash, run: `which fzf` and `which jq`
   - If nothing appears, they're not installed or not in PATH

2. **Reinstall using one of the methods above**

3. **Manual PATH fix** (if installed but not found):
   - Find where `fzf.exe` and `jq.exe` are located
   - Add that directory to your Windows PATH:
     - Search for "Environment Variables" in Windows
     - Edit "Path" variable
     - Add the directory containing the executables

### "command not found: mcp"

**Solution**: The `~/.local/bin` directory is not in your PATH.

1. **Temporary fix** (current session only):
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

2. **Permanent fix**:
   Add this line to your `~/.bashrc`:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

### PATH doesn't persist

Git Bash uses `~/.bashrc` or `~/.bash_profile` for configuration.

1. Open Git Bash
2. Create/edit `~/.bashrc`:
   ```bash
   nano ~/.bashrc
   ```
3. Add:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```
4. Save and exit (Ctrl+X, then Y, then Enter)
5. Restart Git Bash

### "Permission denied" errors

Run Git Bash **as Administrator** and try again.

## PowerShell Native Version

### Installation

**Requirements:**
- PowerShell 7.0 or higher ([Download](https://aka.ms/powershell))
- Git for Windows (to clone repository)

**Step 1: Install PowerShell 7+**

1. Download from: https://aka.ms/powershell
2. Run the installer
3. Verify: Open PowerShell and run `$PSVersionTable.PSVersion`

**Step 2: Clone and Install Module**

```powershell
# Clone repository
git clone https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector.git

# Navigate to PowerShell module
cd Claude-Code-MCP-Server-Selector/src/powershell

# Run installer
.\install.ps1
```

The installer will:
- Check PowerShell version
- Copy module to your PowerShell modules directory
- Set up `mcp` and `claudemcp` aliases
- Optionally install PSFzf for enhanced UI

**Step 3: Verify Installation**

```powershell
# Check module is loaded
Get-Module MCP-Selector

# Get help
Get-Help Invoke-MCPSelector -Full

# Launch selector
mcp
```

### Usage

The PowerShell version works identically to the bash version:

```powershell
# Launch interactive selector
mcp

# Launch with specific project
mcp C:\Users\YourName\Projects\MyApp

# Get help
mcp -?
```

### Enhanced UI (Optional)

For an enhanced TUI experience similar to the bash version:

```powershell
# Install PSFzf module
Install-Module PSFzf -Scope CurrentUser

# Install fzf.exe via Scoop
scoop install fzf

# OR via Chocolatey
choco install fzf
```

**Without PSFzf:** Uses native Out-GridView (GUI selector)
**With PSFzf:** Uses fzf terminal UI (identical to bash version)

### Configuration

The PowerShell version uses the **same configuration files** as the bash version:
- `.claude/settings.json`
- `.claude/settings.local.json`
- `.mcp.json`
- `~/.claude.json`

This means:
- ✅ You can switch between bash and PowerShell versions
- ✅ Both versions read the same configs
- ✅ No migration needed
- ✅ Fully compatible

### Updating

```powershell
# Pull latest changes
cd Claude-Code-MCP-Server-Selector
git pull

# Reinstall module
cd src/powershell
.\install.ps1
```

## Getting Help

If you encounter issues:

1. Check this troubleshooting guide
2. Verify dependencies: `fzf --version` and `jq --version`
3. Check PATH: `echo $PATH`
4. Open an issue on GitHub with:
   - Your Windows version
   - Git Bash version (`bash --version`)
   - Error messages
   - Output of `which fzf jq`

## Resources

- **Git for Windows**: https://git-scm.com/download/win
- **Chocolatey**: https://chocolatey.org/install
- **Scoop**: https://scoop.sh
- **fzf Releases**: https://github.com/junegunn/fzf/releases
- **jq Downloads**: https://jqlang.github.io/jq/download/
