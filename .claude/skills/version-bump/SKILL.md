---
name: version-bump
description: Bump semantic version across all project files (package.json, CLI, README, docs). Use for version updates without full release.
allowed-tools:
  - Read
  - Edit
  - Glob
  - Grep
  - Bash(npm run build)
  - Bash(npm test)
  - Bash(npm install:*)
  - Bash(node:*)
  - Bash(echo:*)
  - AskUserQuestion
user-invocable: false
---

# Version Bump Skill

Updates semantic version consistently across all project files. This skill handles version updates only - use `/release` for the full release workflow including git and npm publishing.

## Trigger Words

Use when user says: "bump version", "update version", "version bump", or when called by the release skill.

## Version Locations (Canonical List)

These are ALL locations where version numbers appear. Every bump MUST update all of these:

### Primary Sources

| File | Line | Pattern | Example |
|------|------|---------|---------|
| `package.json` | 3 | `"version": "X.Y.Z"` | `"version": "2.1.0"` |
| `src/cli/index.ts` | 18 | `const VERSION = 'X.Y.Z';` | `const VERSION = '2.1.0';` |

### Documentation

| File | Line | Pattern | Example |
|------|------|---------|---------|
| `README.md` | 12 | `> **vX.Y.Z**:` | `> **v2.1.0**:` |
| `docs/index.html` | 45 | `"softwareVersion": "X.Y.Z"` | `"softwareVersion": "2.1.0"` |

### Auto-generated (DO NOT edit manually)

| File | Notes |
|------|-------|
| `package-lock.json` | Updated by `npm install --package-lock-only` |

## Procedure

### Step 1: Determine New Version

Ask user or determine from context:

| Type | Pattern | When to Use |
|------|---------|-------------|
| **patch** | X.Y.Z+1 | Bug fixes, minor changes |
| **minor** | X.Y+1.0 | New features, backwards compatible |
| **major** | X+1.0.0 | Breaking changes |

Or accept explicit version like "2.1.0".

### Step 2: Read Current Version

```bash
node -p "require('./package.json').version"
```

### Step 3: Update All Locations (IN ORDER)

1. **package.json** (line 3):
   ```json
   "version": "NEW_VERSION",
   ```

2. **src/cli/index.ts** (line 18):
   ```typescript
   const VERSION = 'NEW_VERSION';
   ```

3. **README.md** (line 12):
   ```markdown
   > **vNEW_VERSION**: [brief description of changes]
   ```

4. **docs/index.html** (line 45):
   ```json
   "softwareVersion": "NEW_VERSION",
   ```

### Step 4: Update Lock File

```bash
npm install --package-lock-only
```

### Step 5: Build

```bash
npm run build
```

### Step 6: Verify

```bash
# All versions should match
echo "package.json: $(node -p "require('./package.json').version")"
echo "CLI binary:   $(node dist/cli.js --version)"

# Tests should pass
npm test
```

## Verification Checklist

Before completing, verify ALL match the new version:

- [ ] `package.json` version field
- [ ] `src/cli/index.ts` VERSION constant
- [ ] `README.md` version banner
- [ ] `docs/index.html` softwareVersion
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `node dist/cli.js --version` outputs correct version

## Semantic Versioning Reference

| Change Type | Version Part | Reset |
|-------------|--------------|-------|
| Bug fix | Patch (Z) | None |
| New feature | Minor (Y) | Patch → 0 |
| Breaking change | Major (X) | Minor → 0, Patch → 0 |

Examples:
- `2.0.3` + patch = `2.0.4`
- `2.0.3` + minor = `2.1.0`
- `2.0.3` + major = `3.0.0`

## Notes

- Never edit `package-lock.json` manually
- The README version banner should include a brief changelog note
- Always run build and tests after version bump
- This skill does NOT commit changes - use `/release` for full workflow

## Related

Use **`/release`** for full release workflow including:
- Version bump (this skill)
- Git commit
- Git tag
- Push to remote
- GitHub release creation
- Automatic npm publish via OIDC
