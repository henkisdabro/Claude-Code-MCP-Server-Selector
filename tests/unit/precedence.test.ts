/**
 * Precedence resolution tests
 *
 * Tests the dual precedence system to ensure it matches the bash implementation.
 */

import { describe, it, expect } from 'vitest';
import { resolveServers, tracePrecedence } from '../../src/core/config/precedence.js';
import type { RawDefinition } from '../../src/types/index.js';

describe('resolveServers', () => {
  it('should resolve a single server definition', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
    ];

    const result = resolveServers(rawData);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'fetch',
      state: 'on', // Default enabled
      scope: 'project',
      sourceType: 'mcpjson',
    });
  });

  it('should use higher priority definition when multiple exist', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'user',
        file: '~/.mcp.json',
        sourceType: 'mcpjson',
      },
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
    ];

    const result = resolveServers(rawData);

    expect(result).toHaveLength(1);
    expect(result[0]?.scope).toBe('project'); // Project (2) > User (1)
  });

  it('should resolve state independently from definition', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
      {
        type: 'disable',
        server: 'fetch',
        scope: 'local',
        file: './.claude/settings.local.json',
      },
    ];

    const result = resolveServers(rawData);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'fetch',
      state: 'off', // Disabled by local scope
      scope: 'project', // Definition from project
    });
  });

  it('should prefer higher priority state', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
      {
        type: 'enable',
        server: 'fetch',
        scope: 'user',
        file: '~/.claude/settings.json',
      },
      {
        type: 'disable',
        server: 'fetch',
        scope: 'local',
        file: './.claude/settings.local.json',
      },
    ];

    const result = resolveServers(rawData);

    expect(result[0]?.state).toBe('off'); // Local (3) > User (1)
  });

  it('should mark enterprise servers with flag', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'corp-api',
        scope: 'enterprise',
        file: '/etc/claude-code/managed-mcp.json',
        sourceType: 'mcpjson',
      },
    ];

    const result = resolveServers(rawData);

    expect(result[0]?.flags.enterprise).toBe(true);
  });

  it('should sort servers alphabetically', () => {
    const rawData: RawDefinition[] = [
      { type: 'def', server: 'zebra', scope: 'project', file: './.mcp.json', sourceType: 'mcpjson' },
      { type: 'def', server: 'alpha', scope: 'project', file: './.mcp.json', sourceType: 'mcpjson' },
      { type: 'def', server: 'beta', scope: 'project', file: './.mcp.json', sourceType: 'mcpjson' },
    ];

    const result = resolveServers(rawData);

    expect(result.map(s => s.name)).toEqual(['alpha', 'beta', 'zebra']);
  });

  it('should handle enterprise policy denylist', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'blocked-server',
        scope: 'user',
        file: '~/.mcp.json',
        sourceType: 'mcpjson',
      },
    ];

    const policy = {
      deniedServers: new Set(['blocked-server']),
      allowedServers: null,
    };

    const result = resolveServers(rawData, policy);

    expect(result[0]?.flags.blocked).toBe(true);
  });

  it('should handle enterprise policy allowlist', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'unlisted-server',
        scope: 'user',
        file: '~/.mcp.json',
        sourceType: 'mcpjson',
      },
    ];

    const policy = {
      deniedServers: new Set<string>(),
      allowedServers: new Set(['only-this-one']),
    };

    const result = resolveServers(rawData, policy);

    expect(result[0]?.flags.restricted).toBe(true);
  });
});

describe('tracePrecedence', () => {
  it('should trace all sources for a server', () => {
    const rawData: RawDefinition[] = [
      { type: 'def', server: 'fetch', scope: 'user', file: '~/.mcp.json', sourceType: 'mcpjson' },
      { type: 'def', server: 'fetch', scope: 'project', file: './.mcp.json', sourceType: 'mcpjson' },
      { type: 'enable', server: 'fetch', scope: 'user', file: '~/.claude/settings.json' },
      { type: 'disable', server: 'fetch', scope: 'local', file: './.claude/settings.local.json' },
    ];

    const trace = tracePrecedence('fetch', rawData);

    expect(trace.definitionSources).toHaveLength(2);
    expect(trace.stateSources).toHaveLength(2);
    expect(trace.resolved.definition).toBe('project');
    expect(trace.resolved.state).toBe('local');
  });

  it('should return null state for servers with no explicit state', () => {
    const rawData: RawDefinition[] = [
      { type: 'def', server: 'fetch', scope: 'project', file: './.mcp.json', sourceType: 'mcpjson' },
    ];

    const trace = tracePrecedence('fetch', rawData);

    expect(trace.stateSources).toHaveLength(0);
    expect(trace.resolved.state).toBeNull();
  });
});

describe('same-priority conflicts', () => {
  it('should use last-wins for same priority definitions', () => {
    // When two definitions have the same priority, the last one wins
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'local',
        file: 'first.json',
        sourceType: 'mcpjson',
        definition: { command: 'first' },
      },
      {
        type: 'def',
        server: 'fetch',
        scope: 'local',
        file: 'second.json',
        sourceType: 'mcpjson',
        definition: { command: 'second' },
      },
    ];

    const result = resolveServers(rawData);

    expect(result).toHaveLength(1);
    expect(result[0]?.definitionFile).toBe('second.json');
    expect(result[0]?.definition).toEqual({ command: 'second' });
  });

  it('should use last-wins for enable/disable at same priority', () => {
    // When enable and disable are at same priority, last one wins
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
      {
        type: 'enable',
        server: 'fetch',
        scope: 'local',
        file: 'settings.local.json',
      },
      {
        type: 'disable',
        server: 'fetch',
        scope: 'local',
        file: 'settings.local.json',
      },
    ];

    const result = resolveServers(rawData);

    // Last (disable) should win
    expect(result[0]?.state).toBe('off');
  });

  it('should use last-wins for disable/enable at same priority (reverse order)', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'fetch',
        scope: 'project',
        file: './.mcp.json',
        sourceType: 'mcpjson',
      },
      {
        type: 'disable',
        server: 'fetch',
        scope: 'local',
        file: 'settings.local.json',
      },
      {
        type: 'enable',
        server: 'fetch',
        scope: 'local',
        file: 'settings.local.json',
      },
    ];

    const result = resolveServers(rawData);

    // Last (enable) should win
    expect(result[0]?.state).toBe('on');
  });
});

describe('plugin state resolution', () => {
  it('should default plugin servers to off when not in enabledPlugins', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'ide:developer-toolkit@claude-plugins',
        scope: 'user',
        file: 'installed_plugins.json',
        sourceType: 'plugin',
      },
    ];

    const result = resolveServers(rawData);

    expect(result[0]?.state).toBe('off'); // Plugins default to off
  });

  it('should enable plugin server when in enabledPlugins', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'ide:developer-toolkit@claude-plugins',
        scope: 'user',
        file: 'installed_plugins.json',
        sourceType: 'plugin',
      },
      {
        type: 'enable',
        server: 'developer-toolkit@claude-plugins',
        scope: 'local',
        file: 'settings.local.json',
        sourceType: 'plugin',
      },
    ];

    const result = resolveServers(rawData);

    expect(result[0]?.state).toBe('on');
  });

  it('should disable plugin server when explicitly disabled in enabledPlugins', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'ide:developer-toolkit@claude-plugins',
        scope: 'user',
        file: 'installed_plugins.json',
        sourceType: 'plugin',
      },
      {
        type: 'disable-plugin',
        server: 'developer-toolkit@claude-plugins',
        scope: 'local',
        file: 'settings.local.json',
        sourceType: 'plugin',
      },
    ];

    const result = resolveServers(rawData);

    expect(result[0]?.state).toBe('off');
  });
});

describe('runtime-disable handling', () => {
  it('should set runtime to stopped for direct servers in disabledMcpServers', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'my-server',
        scope: 'user',
        file: '~/.claude.json',
        sourceType: 'direct-global',
      },
      {
        type: 'runtime-disable',
        server: 'my-server',
        scope: 'local',
        file: '~/.claude.json',
      },
    ];

    const result = resolveServers(rawData);

    // Direct server in disabledMcpServers should be off
    expect(result[0]?.state).toBe('off');
  });

  it('should handle plugin disable format in disabledMcpServers', () => {
    const rawData: RawDefinition[] = [
      {
        type: 'def',
        server: 'ide:developer-toolkit@claude-plugins',
        scope: 'user',
        file: 'installed_plugins.json',
        sourceType: 'plugin',
      },
      {
        type: 'enable',
        server: 'developer-toolkit@claude-plugins',
        scope: 'local',
        file: 'settings.local.json',
        sourceType: 'plugin',
      },
      {
        type: 'runtime-disable',
        server: 'plugin:developer-toolkit:ide',
        scope: 'local',
        file: '~/.claude.json',
      },
    ];

    const result = resolveServers(rawData);

    // Plugin enabled but runtime-disabled should still be 'on' (plugins don't support ORANGE)
    // The runtime-disable only affects direct servers for ORANGE state
    expect(result[0]?.state).toBe('on');
  });
});
