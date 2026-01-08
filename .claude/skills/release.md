---
name: release
description: Full release workflow with version bump, commit, tag, GitHub release, and automatic npm publish via OIDC
model: claude-opus-4-5-20251101
context: fork
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash(npm:*)
  - Bash(git:*)
  - Bash(gh:*)
  - Bash(node:*)
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "git status --porcelain"
      once: true
---

# Release Skill

Automates the full release process: version bump, commit, tag, GitHub release, and npm publish.

## Trigger

Use when:
- User says "release", "publish", "create release", "ship it"
- User says "/release" or "/publish"
- After completing features that warrant a new release
- User wants to publish to npm

## Prerequisites

- Clean git working directory (no uncommitted changes, or only version-related changes)
- GitHub CLI (`gh`) authenticated
- On `main` branch (or user-specified branch)

## Release Flow

```
Version Bump → Build → Test → Commit → Tag → Push → GitHub Release → npm Publish (automatic via OIDC)
```

The GitHub Actions workflow `.github/workflows/deploy.yml` automatically publishes to npm when a GitHub release is created using **npm Trusted Publishing (OIDC)**.

## IMPORTANT: No Local Publishing

**Local `npm publish` is NOT supported.** This project uses npm Trusted Publishing which only works via GitHub Actions. The OIDC authentication is tied to the GitHub repository and workflow, so publishing must happen through the CI pipeline.

If you try to run `npm publish` locally, it will fail with authentication errors.

## Procedure

### Step 1: Pre-flight Checks

```bash
# Verify clean state or only expected changes
git status

# Verify on main branch
git branch --show-current

# Verify gh CLI is authenticated
gh auth status

# Check current npm version
npm view @henkisdabro/mcp-selector version
```

### Step 2: Version Bump

Use the `/version-bump` skill or manually update all version locations:

| File | Line | Pattern |
|------|------|---------|
| `package.json` | 3 | `"version": "X.Y.Z"` |
| `src/cli/index.ts` | 18 | `const VERSION = 'X.Y.Z';` |
| `README.md` | 12 | `> **vX.Y.Z**:` |
| `docs/index.html` | 45 | `"softwareVersion": "X.Y.Z"` |

### Step 3: Build and Test

```bash
npm run build
npm test
```

Verify CLI version:
```bash
node dist/cli.js --version
```

### Step 4: Update Lock File

```bash
npm install --package-lock-only
```

### Step 5: Commit Changes

```bash
git add package.json package-lock.json src/cli/index.ts README.md docs/index.html
git commit -m "chore: release vX.Y.Z"
```

### Step 6: Create Git Tag

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

### Step 7: Push to Remote

```bash
git push origin main
git push origin vX.Y.Z
```

### Step 8: Create GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
  --notes "## What's Changed

- [List changes here]

**Full Changelog**: https://github.com/henkisdabro/Claude-Code-MCP-Server-Selector/compare/vPREVIOUS...vX.Y.Z"
```

This triggers the GitHub Actions workflow which:
1. Runs type checking
2. Runs tests
3. Builds production bundle
4. Publishes to npm registry

### Step 9: Verify Publication

Wait ~2-3 minutes for GitHub Actions, then verify:

```bash
# Check npm registry
npm view @henkisdabro/mcp-selector version

# Check GitHub Actions status
gh run list --limit 1
```

## Quick Release Command

For a patch release with minimal changes:

```bash
# Bump, build, test, commit, tag, push, release - all in one
NEW_VERSION="X.Y.Z"
git add -A && \
git commit -m "chore: release v${NEW_VERSION}" && \
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}" && \
git push origin main && \
git push origin "v${NEW_VERSION}" && \
gh release create "v${NEW_VERSION}" --title "v${NEW_VERSION}" --generate-notes
```

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
```

## Version Checklist

Before releasing, verify ALL versions match:

```bash
echo "package.json: $(node -p \"require('./package.json').version\")"
echo "CLI source:   $(grep 'const VERSION' src/cli/index.ts | grep -oP \"'[^']+'\"|tr -d \"'\")"
echo "README:       $(grep -oP 'v[0-9]+\\.[0-9]+\\.[0-9]+' README.md | head -1)"
echo "docs/index:   $(grep -oP '\"softwareVersion\": \"[^\"]+\"' docs/index.html | grep -oP '[0-9]+\\.[0-9]+\\.[0-9]+')"
```

## Semantic Versioning Guide

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Bug fix | Patch (0.0.X) | Fix toggle logic |
| New feature (backwards compatible) | Minor (0.X.0) | Add new command |
| Breaking change | Major (X.0.0) | Change CLI interface |

## Example: Full Release Session

```
User: "Release 2.0.3"

1. Verify clean git state
2. Update versions:
   - package.json → "2.0.3"
   - src/cli/index.ts → '2.0.3'
   - README.md → v2.0.3
   - docs/index.html → "2.0.3"
3. npm run build && npm test
4. npm install --package-lock-only
5. git add -A && git commit -m "chore: release v2.0.3"
6. git tag -a v2.0.3 -m "Release v2.0.3"
7. git push origin main && git push origin v2.0.3
8. gh release create v2.0.3 --title "v2.0.3" --generate-notes
9. Wait for GitHub Actions to publish to npm
10. Verify: npm view @henkisdabro/mcp-selector version
```

## Notes

- **Never run `npm publish` locally** - it won't work with trusted publishing
- The npm publish is handled automatically by GitHub Actions via OIDC
- Always create releases from the `main` branch
- Use `--generate-notes` for auto-generated changelog from PR titles

## npm Trusted Publishing Configuration

The npm package uses trusted publishing (OIDC) with these requirements:
- **npm CLI 11.5.1+** (workflow upgrades npm automatically)
- **Repository**: `henkisdabro/Claude-Code-MCP-Server-Selector`
- **Workflow**: `deploy.yml`
- **Environment**: (none required)

The workflow (`.github/workflows/deploy.yml`) handles everything:
1. Tests must pass first
2. npm is upgraded to latest (11.5.1+)
3. OIDC authentication happens automatically
4. Provenance is generated automatically

If publishing fails, verify settings on npm: https://www.npmjs.com/package/@henkisdabro/mcp-selector/access
