---
name: release
description: Full npm release workflow - version bump, commit, tag, push, GitHub release. Use when publishing to npm, creating a release, or shipping a new version.
model: claude-opus-4-5-20251101
context: fork
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash(npm:*)
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(node:*)
  - Bash(echo:*)
  - Bash(sleep:*)
  - AskUserQuestion
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "git status --porcelain"
      once: true
---

# Release Skill

Complete npm release workflow that handles version bumping, git operations, and GitHub releases in the correct order to trigger automatic npm publishing.

## Trigger Words

Use when user says: "release", "publish", "ship it", "create release", "npm publish", "/release"

## Critical: Correct Order of Operations

The workflow MUST follow this exact sequence to ensure npm publishing works:

```
1. Version Bump (all files)
2. Build & Test
3. Git Commit (version changes)
4. Git Tag (annotated)
5. Push Commits to main
6. Push Tag to origin
7. Create GitHub Release (triggers npm publish)
8. Verify npm publication
9. Auto-update global installation
```

## Why Order Matters

- **GitHub Actions trigger**: The `deploy.yml` workflow only runs `npm publish` when `github.ref` starts with `refs/tags/v`
- **Tag must exist on remote**: If you create a GitHub release before pushing the tag, it fails
- **Commits must be pushed first**: The tag must point to a commit that exists on the remote

## Pre-flight Checks

Before starting, verify:

```bash
# 1. Clean working directory (or only version-related changes)
git status

# 2. On main branch
git branch --show-current

# 3. GitHub CLI authenticated
gh auth status

# 4. Current versions in sync
echo "package.json: $(node -p "require('./package.json').version")"
echo "CLI source:   $(grep "const VERSION" src/cli/index.ts | grep -oP "'[^']+'" | tr -d "'")"
echo "README:       $(grep -oP 'v[0-9]+\.[0-9]+\.[0-9]+' README.md | head -1)"
echo "docs/index:   $(grep -oP '"softwareVersion": "[^"]+"' docs/index.html | grep -oP '[0-9]+\.[0-9]+\.[0-9]+')"
```

## Version Locations

ALL of these MUST be updated to the same version:

| File | Line | Pattern |
|------|------|---------|
| `package.json` | 3 | `"version": "X.Y.Z"` |
| `src/cli/index.ts` | 18 | `const VERSION = 'X.Y.Z';` |
| `README.md` | 12 | `> **vX.Y.Z**:` |
| `docs/index.html` | 45 | `"softwareVersion": "X.Y.Z"` |

## Complete Workflow

### Step 1: Determine Version

Ask user for version type if not specified:
- **patch** (X.Y.Z+1): Bug fixes
- **minor** (X.Y+1.0): New features
- **major** (X+1.0.0): Breaking changes

Or accept explicit version like "2.1.0".

### Step 2: Update All Version Locations

Update each file with the new version (see Version Locations table).

### Step 3: Update package-lock.json

```bash
npm install --package-lock-only
```

### Step 4: Build and Test

```bash
npm run build
npm test
```

Verify CLI version:
```bash
node dist/cli.js --version
```

### Step 5: Commit Version Changes

```bash
git add package.json package-lock.json src/cli/index.ts README.md docs/index.html
git commit -m "chore: release vX.Y.Z"
```

### Step 6: Create Annotated Tag

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

### Step 7: Push Commits First

```bash
git push origin main
```

### Step 8: Push Tag

```bash
git push origin vX.Y.Z
```

### Step 9: Create GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --generate-notes
```

This triggers the GitHub Actions workflow which:
1. Runs tests on all platforms
2. Builds production bundle
3. Publishes to npm using OIDC trusted publishing

### Step 10: Verify Publication

Wait 2-3 minutes, then verify:

```bash
# Check GitHub Actions status
gh run list --limit 1

# Check npm registry (after CI completes)
npm view @henkisdabro/mcp-selector version
```

### Step 11: Auto-Update Global Installation

After verifying npm publication, automatically update the global installation:

```bash
# Wait for npm registry to propagate (90 seconds - CI takes ~60-75s)
echo "Waiting 90 seconds for npm registry propagation..."
sleep 90

# Verify the new version is available on npm
npm view @henkisdabro/mcp-selector version

# Update global installation
echo "Updating global installation..."
npm install -g @henkisdabro/mcp-selector@X.Y.Z

# Verify global installation
mcp --version
```

This ensures the local development environment has the latest released version available globally.

## Semantic Versioning Guide

| Change Type | Bump | Example |
|-------------|------|---------|
| Bug fix | Patch | Fix toggle logic bug |
| New feature (backwards compatible) | Minor | Add new CLI command |
| Breaking change | Major | Change CLI interface |

## Rollback Procedure

If something goes wrong:

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag (if pushed)
git push origin --delete vX.Y.Z

# Delete GitHub release (if created)
gh release delete vX.Y.Z --yes

# Revert commit (if needed)
git revert HEAD
git push origin main
```

## Important Notes

- **Never run `npm publish` locally** - it won't work with trusted publishing
- The npm publish happens automatically via GitHub Actions OIDC
- Always release from the `main` branch
- Use `--generate-notes` for auto-generated changelog from PR titles
- The workflow file MUST be named `deploy.yml` for OIDC to work

## npm Trusted Publishing

This project uses npm Trusted Publishing (OIDC) which means:
- No npm tokens stored in GitHub secrets
- Publishing only works through GitHub Actions
- The workflow must match the configuration on npmjs.com
- Repository: `henkisdabro/Claude-Code-MCP-Server-Selector`
- Workflow: `deploy.yml`

## Quick Reference: Tag-Only Release

If version is already bumped and committed, just need to tag and release:

```bash
VERSION="X.Y.Z"
git tag -a "v${VERSION}" -m "Release v${VERSION}"
git push origin main
git push origin "v${VERSION}"
gh release create "v${VERSION}" --title "v${VERSION}" --generate-notes
```
