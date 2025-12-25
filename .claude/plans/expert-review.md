# Expert Review: MCP Server Selector v2.0 Plan

## Review Date: December 2025
## Reviewer: Claude Code & MCP Expert Analysis

---

## EXECUTIVE SUMMARY

**Overall Score: 6/10 - Achievable with Modifications**

The plan is ambitious but has significant architectural, algorithmic, and implementation risks that must be addressed. Key concerns:

1. **State file format migration** - HIGH RISK, needs bulletproof rollback
2. **Precedence resolution complexity** - Remove mtime tiebreaker
3. **Lazy caching** - DEFER, introduces cache invalidation bugs
4. **Windows PowerShell port** - DEFER until Bash is stable

---

## CRITICAL FINDINGS

### Architecture (6/10)

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| State file v2 format too complex | HIGH | Add schema version header, non-destructive migration |
| mcp-shared.json single point of failure | MEDIUM | Keep business rules in code, not config |
| Cross-platform code sharing unrealistic | MEDIUM | Accept different implementations, share protocol only |

### Algorithms (5/10)

| Issue | Severity | Recommendation |
|-------|----------|----------------|
| mtime tiebreaker fragile | HIGH | REMOVE - clock skew, NFS issues, user confusion |
| "Explicit > Implicit" conflicts with scope | HIGH | Document clearly, scope ALWAYS wins |
| Plugin optimization premature | LOW | Defer - unlikely to exceed 20 plugins |
| Lazy caching race conditions | HIGH | REMOVE from Phase 2 entirely |

### Missing Items (5/10)

| Gap | Impact |
|-----|--------|
| 100+ servers pagination | High - TUI unusable |
| Concurrent modifications (two windows) | High - race conditions |
| Permission errors handling | Medium |
| Server name conflicts across scopes | Medium |
| Symlink attacks security | Medium |

### Implementation Risks (4/10)

| Risk | Level | Mitigation |
|------|-------|------------|
| State file migration corruption | CRITICAL | Backup + dry-run + rollback |
| Windows PowerShell port complexity | CRITICAL | Defer, create separate codebase |
| Precedence regression bugs | HIGH | 80%+ test coverage |
| Cache invalidation bugs | HIGH | Remove lazy caching |

---

## RECOMMENDATIONS

### Phase Reordering

```
ORIGINAL                          REVISED
=========                         =======
Phase 1: Bug workarounds     →    Phase 1: Bug workarounds + Testing infra
Phase 2: Algorithm optimize  →    Phase 2: Features + Core tests
Phase 3: New features        →    Phase 3: Polish + Documentation
Phase 4: Windows PowerShell  →    Phase 4: Windows (AFTER Bash stable)
Phase 5: Testing             →    Phase 5: Optimizations (IF needed)
```

### Items to REMOVE from Plan

1. **File modification time tiebreaker** - Too fragile, introduces subtle bugs
2. **Lazy runtime caching with fswatch** - Race conditions, 50ms savings not worth complexity
3. **Code sharing between Bash/PowerShell** - Unrealistic, share protocol only
4. **Registry-based enterprise config** - Stick with file-based for now

### Items to ADD to Plan

1. **--debug-precedence flag** - Shows resolution steps for a server
2. **--validate flag** - Quick config validation without complex fixes
3. **Schema version in state file** - Enables safe migrations
4. **Rollback mechanism** - For state file migration failures
5. **KNOWN_ISSUES.md** - Document Claude bugs and workarounds
6. **Recovery command** - `./mcp --restore-plugin <name>` for hard-disabled plugins

### Quick Wins (High Value, Low Effort)

| Win | Effort | Value |
|-----|--------|-------|
| Add --debug-precedence | 2 hours | HIGH |
| Add --validate | 1 hour | HIGH |
| Improve error messages | 4 hours | HIGH |
| Add version to output | 30 min | MEDIUM |
| Document known limitations | 2 hours | HIGH |

---

## REVISED SCORECARD

| Dimension | Original | After Revision |
|-----------|----------|----------------|
| Architecture | 6/10 | 8/10 |
| Algorithms | 5/10 | 8/10 |
| Claude Compatibility | 7/10 | 8/10 |
| Missing Items | 5/10 | 7/10 |
| Implementation Risks | 4/10 | 7/10 |
| Cross-Platform | 6/10 | 7/10 |
| **Overall** | **6/10** | **7.5/10** |

---

## CRITICAL SUCCESS FACTORS

1. **State file migration MUST be bulletproof**
   - Backup before migration
   - Dry-run first
   - Easy rollback
   - Extensive testing

2. **Windows port MUST come after Bash is stable**
   - Don't port code directly
   - Create separate implementation
   - Validate outputs are identical

3. **Precedence algorithm MUST be simplified**
   - Remove mtime tiebreaker
   - Document rules clearly
   - 80%+ test coverage

4. **Testing MUST be in Phase 1, not Phase 5**
   - Can't safely make changes without tests
   - Migration needs test coverage first

---

## FINAL VERDICT

**PROCEED with plan after incorporating these changes.**

The core ideas are sound. Execution details need strengthening. Focus on:
1. Stability first (Phase 1)
2. Features second (Phases 2-3)
3. Expansion last (Phase 4)
