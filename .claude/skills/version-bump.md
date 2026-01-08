---
name: version-bump
description: Bump semantic version across all project files (package.json, CLI, README, docs)
allowed-tools:
  - Read
  - Edit
  - Bash(npm run build)
  - Bash(npm test)
  - Bash(npm install)
  - Bash(node:*)
---

# Version Bump Skill

Manages semantic versioning across the cc-mcp-launcher project. Ensures all version references are updated consistently when releasing new versions.

## Trigger

Use when:
- User requests a version bump (e.g., "bump version", "release v2.1.0", "update to 2.0.3")
- User says "version bump", "/version-bump", or similar
- After completing a feature or fix that warrants a new release

## Version Locations (Canonical List)

These are ALL locations where version numbers appear in the project. Every version bump MUST update all of these:

### Primary Sources (MUST be in sync)

| File | Line | Pattern | Example |
|------|------|---------|---------|
| `package.json` | 3 | `"version": "X.Y.Z"` | `"version": "2.0.2"` |
| `src/cli/index.ts` | 18 | `const VERSION = 'X.Y.Z';` | `const VERSION = '2.0.2';` |

### Documentation (Should match latest)

| File | Line | Pattern | Example |
|------|------|---------|---------|
| `README.md` | 12 | `> **vX.Y.Z**:` | `> **v2.0.2**:` |
| `docs/index.html` | 45 | `"softwareVersion": "X.Y.Z"` | `"softwareVersion": "2.0.2"` |

### Auto-generated (DO NOT edit manually)

| File | Notes |
|------|-------|
| `package-lock.json` | Updated by `npm install` after package.json changes |

## Procedure

### Step 1: Determine Version Type

Ask user or determine from context:
- **patch** (X.Y.Z+1): Bug fixes, minor changes
- **minor** (X.Y+1.0): New features, backwards compatible
- **major** (X+1.0.0): Breaking changes

### Step 2: Calculate New Version

Read current version from `package.json` and calculate the new version based on semver rules.

### Step 3: Update All Locations

Update these files IN THIS ORDER:

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
   > **vNEW_VERSION**: [description of changes]
   ```

4. **docs/index.html** (line 45):
   ```json
   "softwareVersion": "NEW_VERSION",
   ```

### Step 4: Rebuild

```bash
npm run build
```

### Step 5: Verify

Run the following checks:
```bash
# Check package.json version
node -p "require('./package.json').version"

# Check CLI version matches
node dist/cli.js --version

# Run tests
npm test
```

### Step 6: Update package-lock.json

```bash
npm install
```

This regenerates `package-lock.json` with the new version.

## Verification Checklist

Before completing a version bump, verify:

- [ ] `package.json` version matches new version
- [ ] `src/cli/index.ts` VERSION constant matches
- [ ] `README.md` mentions the new version in the banner
- [ ] `docs/index.html` softwareVersion matches
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `node dist/cli.js --version` outputs correct version

## Example Session

User: "Bump to version 2.1.0"

1. Read current version: `2.0.2`
2. New version: `2.1.0`
3. Update:
   - `package.json:3` -> `"version": "2.1.0",`
   - `src/cli/index.ts:18` -> `const VERSION = '2.1.0';`
   - `README.md:12` -> `> **v2.1.0**: ...`
   - `docs/index.html:45` -> `"softwareVersion": "2.1.0",`
4. Run `npm run build && npm test`
5. Run `npm install` to update lock file
6. Verify with `node dist/cli.js --version`

## Adding New Version Locations

If you add a new file that contains version information:
1. Update this skill's "Version Locations" table
2. Add it to the update procedure
3. Add verification step

## Notes

- Never edit `package-lock.json` manually - always use `npm install`
- The README version banner should include a brief changelog note
- The docs/index.html version is for SEO/structured data purposes
- Always run tests after version bump to catch any issues

## Related Skills

- **`/release`** - Full release workflow including version bump, git commit, tag, GitHub release, and automatic npm publish. Use `/release` instead if you want to publish to npm.
