# Claude-Code-MCP-Server-Selector

An Ink TUI and CLI (`mcp`, `claudemcp`) that discovers every MCP server Claude Code can see and
toggles it on or off by editing Claude Code's own config files. Almost every task here turns on
getting those file edits exactly right.

pnpm 11, pinned in `packageManager`. Verify with `pnpm typecheck && pnpm lint && pnpm test` - all
green at HEAD, 198 tests. `.npmrc` sets `minimum-release-age=4320` and dependencies are pinned exact,
so a just-published version refuses to install; that is not a registry outage.

`docs/` is the published GitHub Pages site, not developer documentation. Do not put notes there.

## The config model

**Dual precedence** is the core idea: where a server is *defined* and whether it is *on* resolve
independently, so a server can be defined in one file and controlled from another.

Each control array works in exactly one place, and writing it anywhere else produces valid JSON that
silently does nothing:

- `enabledMcpjsonServers` / `disabledMcpjsonServers` / `enabledPlugins` - only in `.claude/settings*.json`
- `disabledMcpServers` - only in `~/.claude.json`, at the root or under `.projects[cwd]`

Two plugin traps. `enabledPlugins` is keyed `pluginName@marketplace`, one colon shorter than the full
server name `serverKey:pluginName@marketplace`. And setting a plugin to `false` there removes it from
the Claude Code UI altogether rather than merely disabling it, so disable by omitting the key - which
is what `state.ts` does.

Config writes go through `core/config/writer.ts` (temp file plus rename). Several modules import
`writeFileSync` directly for backups and scratch files; do not add a config write that way.

Claude Code picks up `enabledPlugins` and mcpjson changes immediately, but `disabledMcpServers`
changes may need a restart before `claude mcp list` reflects them. Rule that out before chasing a bug.

Anything indexing into `.projects[cwd]` must go through `normaliseProjectPath()` from
`utils/platform.js`: Claude Code writes project keys with forward slashes on every platform, while
Windows `path.normalize()` yields backslashes, and the two are different JSON keys. The bug is
invisible on macOS and Linux with the tests green - it surfaces as a Windows user losing all state.

## Releasing

Use the `release` skill; it owns the sequence. The one thing worth knowing outside it: npm publishing
uses OIDC trusted publishing bound to the workflow file `.github/workflows/deploy.yml`. That filename
cannot change, and it is why the publish job runs `npm publish` in an otherwise all-pnpm pipeline.
