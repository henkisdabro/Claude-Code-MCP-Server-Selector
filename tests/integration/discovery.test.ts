/**
 * Integration tests for MCP server discovery
 *
 * Tests the full discovery pipeline including:
 * - Configuration source discovery
 * - Raw definition extraction
 * - Server resolution with precedence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { extractRawDefinitions, discoverAllSources } from '../../src/core/config/discovery.js';
import { resolveServers } from '../../src/core/config/precedence.js';

describe('Configuration Source Discovery', () => {
  let testDir: string;
  let claudeDir: string;

  beforeEach(() => {
    // Create isolated test directory
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should discover project .mcp.json files', async () => {
    // Create a .mcp.json file in test directory
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'test-server': {
          command: 'echo',
          args: ['test'],
        },
      },
    }));

    const sources = await discoverAllSources(testDir);
    const mcpJsonSource = sources.find((s) => s.path === mcpJsonPath);

    expect(mcpJsonSource).toBeDefined();
    expect(mcpJsonSource?.exists).toBe(true);
  });

  it('should discover settings.json files', async () => {
    // Create settings.json
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
    }));

    const sources = await discoverAllSources(testDir);
    const settingsSource = sources.find((s) => s.path === settingsPath);

    expect(settingsSource).toBeDefined();
    expect(settingsSource?.exists).toBe(true);
  });

  it('should discover settings.local.json files', async () => {
    // Create settings.local.json
    const settingsPath = join(claudeDir, 'settings.local.json');
    writeFileSync(settingsPath, JSON.stringify({
      enabledPlugins: {},
    }));

    const sources = await discoverAllSources(testDir);
    const settingsSource = sources.find((s) => s.path === settingsPath);

    expect(settingsSource).toBeDefined();
    expect(settingsSource?.exists).toBe(true);
  });
});

describe('Raw Definition Extraction', () => {
  let testDir: string;
  let claudeDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should extract MCPJSON server definitions', async () => {
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'test-mcpjson': {
          command: 'node',
          args: ['server.js'],
        },
      },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const serverDef = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-mcpjson'
    );

    expect(serverDef).toBeDefined();
    expect(serverDef?.sourceType).toBe('mcpjson');
    expect(serverDef?.scope).toBe('project');
  });

  it('should extract enable-all-project settings', async () => {
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const enableAllDef = rawDefs.find((d) => d.type === 'enable-all-project');

    expect(enableAllDef).toBeDefined();
    expect(enableAllDef?.server).toBe('*');
  });

  it('should extract disabled MCPJSON server entries', async () => {
    // Create .mcp.json with server
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'disabled-server': {
          command: 'echo',
          args: ['test'],
        },
      },
    }));

    // Create settings with disabled entry
    const settingsPath = join(claudeDir, 'settings.local.json');
    writeFileSync(settingsPath, JSON.stringify({
      disabledMcpjsonServers: ['disabled-server'],
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const disableDef = rawDefs.find((d) =>
      d.type === 'disable' && d.server === 'disabled-server'
    );

    expect(disableDef).toBeDefined();
    expect(disableDef?.scope).toBe('local');
    // Note: sourceType is not set on disable entries - it's inferred from context
  });
});

describe('Server Resolution with Precedence', () => {
  let testDir: string;
  let claudeDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should resolve MCPJSON server as enabled by default', async () => {
    // Create .mcp.json
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'enabled-server': {
          command: 'echo',
          args: ['test'],
        },
      },
    }));

    // Create settings with enableAllProjectMcpServers
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const servers = resolveServers(rawDefs);
    const server = servers.find((s) => s.name === 'enabled-server');

    expect(server).toBeDefined();
    expect(server?.state).toBe('on');
    expect(server?.sourceType).toBe('mcpjson');
  });

  it('should resolve MCPJSON server as disabled when in disabledMcpjsonServers', async () => {
    // Create .mcp.json
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'disabled-server': {
          command: 'echo',
          args: ['test'],
        },
      },
    }));

    // Create settings with disabled entry
    const settingsPath = join(claudeDir, 'settings.local.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
      disabledMcpjsonServers: ['disabled-server'],
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const servers = resolveServers(rawDefs);
    const server = servers.find((s) => s.name === 'disabled-server');

    expect(server).toBeDefined();
    expect(server?.state).toBe('off');
  });

  it('should apply local scope priority over project scope', async () => {
    // Create settings.json (project scope) - disabled
    const projectSettingsPath = join(claudeDir, 'settings.json');
    writeFileSync(projectSettingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
      disabledMcpjsonServers: ['test-server'],
    }));

    // Create settings.local.json (local scope) - enabled
    const localSettingsPath = join(claudeDir, 'settings.local.json');
    writeFileSync(localSettingsPath, JSON.stringify({
      enabledMcpjsonServers: ['test-server'],
    }));

    // Create .mcp.json with server
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'test-server': {
          command: 'echo',
          args: ['test'],
        },
      },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const servers = resolveServers(rawDefs);
    const server = servers.find((s) => s.name === 'test-server');

    expect(server).toBeDefined();
    // Local scope (priority 3) should override project scope (priority 2)
    expect(server?.state).toBe('on');
  });
});

describe('Server Type Classification', () => {
  let testDir: string;
  let claudeDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should classify MCPJSON servers correctly', async () => {
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'mcp-server': { command: 'echo', args: ['test'] },
      },
    }));

    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const servers = resolveServers(rawDefs);
    const server = servers.find((s) => s.name === 'mcp-server');

    expect(server?.sourceType).toBe('mcpjson');
  });

  it('should count servers by type correctly', async () => {
    // Create multiple MCPJSON servers
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'server-1': { command: 'echo', args: ['1'] },
        'server-2': { command: 'echo', args: ['2'] },
        'server-3': { command: 'echo', args: ['3'] },
      },
    }));

    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      enableAllProjectMcpServers: true,
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    const servers = resolveServers(rawDefs);
    const mcpjsonServers = servers.filter((s) => s.sourceType === 'mcpjson');

    expect(mcpjsonServers.length).toBe(3);
  });
});

describe('Root-Level MCP Server Format', () => {
  let testDir: string;
  let claudeDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mcp-test-${randomUUID()}`);
    claudeDir = join(testDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should extract servers from root-level format (command-based)', async () => {
    // Root-level format: servers directly at root, not under mcpServers
    // This is the format used by claude-plugins-official plugins
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      'test-playwright': {
        command: 'npx',
        args: ['@playwright/mcp@latest'],
      },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const serverDef = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-playwright' && d.file === mcpJsonPath
    );

    expect(serverDef).toBeDefined();
    expect(serverDef?.sourceType).toBe('mcpjson');
  });

  it('should extract servers from root-level format (http-based)', async () => {
    // HTTP server at root level (like greptile plugin)
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      'test-greptile': {
        type: 'http',
        url: 'https://api.greptile.com/mcp',
        headers: {
          'Authorization': 'Bearer ${GREPTILE_API_KEY}',
        },
      },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const serverDef = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-greptile' && d.file === mcpJsonPath
    );

    expect(serverDef).toBeDefined();
    expect(serverDef?.sourceType).toBe('mcpjson');
    // Verify the definition has the HTTP properties
    expect(serverDef?.definition).toMatchObject({
      type: 'http',
      url: 'https://api.greptile.com/mcp',
    });
  });

  it('should extract servers from root-level format (sse-based)', async () => {
    // SSE server at root level
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      'test-sse-server': {
        type: 'sse',
        url: 'http://localhost:3000/sse',
      },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const serverDef = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-sse-server' && d.file === mcpJsonPath
    );

    expect(serverDef).toBeDefined();
    expect(serverDef?.sourceType).toBe('mcpjson');
  });

  it('should extract multiple servers from root-level format', async () => {
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      'test-server-1': { command: 'echo', args: ['1'] },
      'test-server-2': { type: 'http', url: 'http://localhost:8080' },
      'test-server-3': { type: 'sse', url: 'http://localhost:3000/sse' },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const serverDefs = rawDefs.filter((d) =>
      d.type === 'def' &&
      d.file === mcpJsonPath &&
      ['test-server-1', 'test-server-2', 'test-server-3'].includes(d.server)
    );

    expect(serverDefs.length).toBe(3);
  });

  it('should ignore non-server properties in root-level format', async () => {
    // Root-level format with non-server properties
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      'test-valid-server': { command: 'echo', args: ['test'] },
      'version': '1.0.0',  // String property - not a server
      'metadata': { name: 'test' },  // Object without command/url/type - not a server
      'servers': ['a', 'b'],  // Array - not a server
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const serverDefs = rawDefs.filter((d) =>
      d.type === 'def' && d.file === mcpJsonPath
    );

    // Only 'test-valid-server' should be extracted
    expect(serverDefs.length).toBe(1);
    expect(serverDefs[0]?.server).toBe('test-valid-server');
  });

  it('should prefer mcpServers key over root-level if both exist', async () => {
    // Mixed format: both mcpServers and root-level
    // This shouldn't happen in practice, but we test the precedence
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'test-standard-server': { command: 'standard', args: [] },
      },
      'test-root-server': { command: 'root', args: [] },
    }));

    const rawDefs = await extractRawDefinitions(testDir);
    // Filter to only servers from the test .mcp.json file
    const standardServer = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-standard-server' && d.file === mcpJsonPath
    );
    const rootServer = rawDefs.find((d) =>
      d.type === 'def' && d.server === 'test-root-server' && d.file === mcpJsonPath
    );

    // Standard format should be preferred, root-level ignored
    expect(standardServer).toBeDefined();
    expect(rootServer).toBeUndefined();
  });
});
