/**
 * Tests for enterprise access control
 */

import { describe, it, expect } from 'vitest';
import {
  checkServerAccess,
  applyEnterpriseFlags,
  isExclusiveEnterpriseMode,
  isMarketplaceLockdown,
  isLockdownMode,
} from '@/core/enterprise/restrictions.js';
import {
  matchServerRestriction,
  matchByName,
  matchByCommand,
  matchByUrl,
  wildcardToRegex,
} from '@/core/enterprise/matching.js';
import type { Server } from '@/types/index.js';

// Helper to create test servers
function createServer(overrides: Partial<Server> = {}): Server {
  return {
    name: 'test-server',
    state: 'on',
    scope: 'project',
    definitionFile: './.mcp.json',
    sourceType: 'mcpjson',
    flags: { enterprise: false, blocked: false, restricted: false },
    runtime: 'unknown',
    ...overrides,
  };
}

describe('matchByName', () => {
  it('matches exact server name', () => {
    const server = createServer({ name: 'github' });
    expect(matchByName(server, 'github')).toBe(true);
  });

  it('rejects different server name', () => {
    const server = createServer({ name: 'github' });
    expect(matchByName(server, 'fetch')).toBe(false);
  });
});

describe('matchByCommand', () => {
  it('matches exact command array', () => {
    const server = createServer({
      command: ['npx', '-y', 'mcp-server-github'],
    });
    expect(matchByCommand(server, ['npx', '-y', 'mcp-server-github'])).toBe(true);
  });

  it('rejects different command', () => {
    const server = createServer({
      command: ['npx', '-y', 'mcp-server-github'],
    });
    expect(matchByCommand(server, ['npx', '-y', 'mcp-server-fetch'])).toBe(false);
  });

  it('rejects different length command', () => {
    const server = createServer({
      command: ['npx', '-y', 'mcp-server-github'],
    });
    expect(matchByCommand(server, ['npx', 'mcp-server-github'])).toBe(false);
  });

  it('rejects server without command', () => {
    const server = createServer();
    expect(matchByCommand(server, ['npx', '-y', 'mcp-server-github'])).toBe(false);
  });
});

describe('matchByUrl', () => {
  it('matches exact URL', () => {
    const server = createServer({
      url: 'https://api.company.com/v1',
    });
    expect(matchByUrl(server, 'https://api.company.com/v1')).toBe(true);
  });

  it('matches URL with wildcards', () => {
    const server = createServer({
      url: 'https://api.company.com/v1',
    });
    expect(matchByUrl(server, 'https://*.company.com/*')).toBe(true);
  });

  it('matches URL with multiple wildcards', () => {
    const server = createServer({
      url: 'https://mcp.internal.corp.net/api/servers',
    });
    expect(matchByUrl(server, 'https://*.*.corp.net/*')).toBe(true);
  });

  it('rejects non-matching URL', () => {
    const server = createServer({
      url: 'https://api.other.com/v1',
    });
    expect(matchByUrl(server, 'https://*.company.com/*')).toBe(false);
  });

  it('rejects server without URL', () => {
    const server = createServer();
    expect(matchByUrl(server, 'https://*.company.com/*')).toBe(false);
  });
});

describe('wildcardToRegex', () => {
  it('converts simple pattern', () => {
    const regex = wildcardToRegex('https://example.com');
    expect(regex.test('https://example.com')).toBe(true);
    expect(regex.test('https://other.com')).toBe(false);
  });

  it('converts wildcard pattern', () => {
    const regex = wildcardToRegex('https://*.example.com/*');
    expect(regex.test('https://api.example.com/v1')).toBe(true);
    expect(regex.test('https://www.example.com/users')).toBe(true);
    expect(regex.test('https://example.com/v1')).toBe(false);
  });

  it('escapes regex special characters', () => {
    const regex = wildcardToRegex('https://example.com/path?query=value');
    expect(regex.test('https://example.com/path?query=value')).toBe(true);
  });
});

describe('matchServerRestriction', () => {
  it('matches by serverName', () => {
    const server = createServer({ name: 'github' });
    expect(matchServerRestriction(server, { serverName: 'github' })).toBe(true);
    expect(matchServerRestriction(server, { serverName: 'fetch' })).toBe(false);
  });

  it('matches by serverCommand', () => {
    const server = createServer({ command: ['npx', '-y', 'mcp-server-github'] });
    expect(matchServerRestriction(server, { serverCommand: ['npx', '-y', 'mcp-server-github'] })).toBe(true);
    expect(matchServerRestriction(server, { serverCommand: ['npx', '-y', 'mcp-server-fetch'] })).toBe(false);
  });

  it('matches by serverUrl', () => {
    const server = createServer({ url: 'https://api.company.com/v1' });
    expect(matchServerRestriction(server, { serverUrl: 'https://*.company.com/*' })).toBe(true);
    expect(matchServerRestriction(server, { serverUrl: 'https://*.other.com/*' })).toBe(false);
  });

  it('returns false for empty restriction', () => {
    const server = createServer();
    expect(matchServerRestriction(server, {})).toBe(false);
  });
});

describe('checkServerAccess', () => {
  describe('no restrictions', () => {
    it('allows all servers when no config', () => {
      const server = createServer();
      const result = checkServerAccess(server, {});
      expect(result.allowed).toBe(true);
    });
  });

  describe('denylist', () => {
    it('blocks server in denylist', () => {
      const server = createServer({ name: 'fetch' });
      const result = checkServerAccess(server, {
        deniedMcpServers: [{ serverName: 'fetch' }],
      });
      expect(result.allowed).toBe(false);
      expect(result.flag).toBe('blocked');
    });

    it('blocks enterprise server in denylist (denylist is absolute)', () => {
      const server = createServer({ name: 'fetch', scope: 'enterprise' });
      const result = checkServerAccess(server, {
        deniedMcpServers: [{ serverName: 'fetch' }],
      });
      expect(result.allowed).toBe(false);
      expect(result.flag).toBe('blocked');
    });

    it('allows server not in denylist', () => {
      const server = createServer({ name: 'github' });
      const result = checkServerAccess(server, {
        deniedMcpServers: [{ serverName: 'fetch' }],
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('allowlist', () => {
    it('allows server in allowlist', () => {
      const server = createServer({ name: 'github' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [{ serverName: 'github' }],
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks server not in allowlist', () => {
      const server = createServer({ name: 'fetch' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [{ serverName: 'github' }],
      });
      expect(result.allowed).toBe(false);
      expect(result.flag).toBe('restricted');
    });

    it('allows enterprise server not in allowlist (enterprise bypasses)', () => {
      const server = createServer({ name: 'fetch', scope: 'enterprise' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [{ serverName: 'github' }],
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks all with empty allowlist (lockdown)', () => {
      const server = createServer({ name: 'github' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [],
      });
      expect(result.allowed).toBe(false);
      expect(result.flag).toBe('restricted');
      expect(result.reason).toContain('lockdown');
    });

    it('allows enterprise server with empty allowlist', () => {
      const server = createServer({ name: 'github', scope: 'enterprise' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [],
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('denylist over allowlist', () => {
    it('denylist wins when server is in both', () => {
      const server = createServer({ name: 'github' });
      const result = checkServerAccess(server, {
        allowedMcpServers: [{ serverName: 'github' }],
        deniedMcpServers: [{ serverName: 'github' }],
      });
      expect(result.allowed).toBe(false);
      expect(result.flag).toBe('blocked');
    });
  });
});

describe('applyEnterpriseFlags', () => {
  it('marks enterprise servers', () => {
    const servers = [
      createServer({ name: 'a', scope: 'enterprise' }),
      createServer({ name: 'b', scope: 'project' }),
    ];
    const result = applyEnterpriseFlags(servers, {});
    expect(result[0].flags.enterprise).toBe(true);
    expect(result[1].flags.enterprise).toBe(false);
  });

  it('marks blocked servers', () => {
    const servers = [createServer({ name: 'fetch' })];
    const result = applyEnterpriseFlags(servers, {
      deniedMcpServers: [{ serverName: 'fetch' }],
    });
    expect(result[0].flags.blocked).toBe(true);
  });

  it('marks restricted servers', () => {
    const servers = [createServer({ name: 'fetch' })];
    const result = applyEnterpriseFlags(servers, {
      allowedMcpServers: [{ serverName: 'github' }],
    });
    expect(result[0].flags.restricted).toBe(true);
  });
});

describe('mode detection', () => {
  it('detects exclusive enterprise mode', () => {
    expect(isExclusiveEnterpriseMode(true)).toBe(true);
    expect(isExclusiveEnterpriseMode(false)).toBe(false);
  });

  it('detects marketplace lockdown', () => {
    expect(isMarketplaceLockdown([])).toBe(true);
    expect(isMarketplaceLockdown([{ source: 'github', repo: 'test' }])).toBe(false);
    expect(isMarketplaceLockdown(undefined)).toBe(false);
  });

  it('detects lockdown mode', () => {
    expect(isLockdownMode(true)).toBe(true);
    expect(isLockdownMode(false)).toBe(false);
  });
});
