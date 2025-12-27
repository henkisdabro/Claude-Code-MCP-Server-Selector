/**
 * Tests for server toggle logic
 */

import { describe, it, expect } from 'vitest';
import {
  getDisplayState,
  getNextDisplayState,
  toggleServer,
  applyToggle,
  enableServer,
  disableServer,
  pauseServer,
  applyStrictDisable,
  enableAllServers,
  disableAllServers,
} from '@/core/servers/toggle.js';
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

describe('getDisplayState', () => {
  it('returns red when state is off', () => {
    const server = createServer({ state: 'off' });
    expect(getDisplayState(server)).toBe('red');
  });

  it('returns orange when state is on but runtime is stopped', () => {
    const server = createServer({ state: 'on', runtime: 'stopped' });
    expect(getDisplayState(server)).toBe('orange');
  });

  it('returns green when state is on and runtime is not stopped', () => {
    const server = createServer({ state: 'on', runtime: 'unknown' });
    expect(getDisplayState(server)).toBe('green');
  });

  it('returns green when state is on and runtime is running', () => {
    const server = createServer({ state: 'on', runtime: 'running' });
    expect(getDisplayState(server)).toBe('green');
  });
});

describe('getNextDisplayState', () => {
  it('cycles red -> green', () => {
    expect(getNextDisplayState('red')).toBe('green');
  });

  it('cycles green -> orange', () => {
    expect(getNextDisplayState('green')).toBe('orange');
  });

  it('cycles orange -> red', () => {
    expect(getNextDisplayState('orange')).toBe('red');
  });
});

describe('toggleServer', () => {
  it('fails for enterprise-managed servers', () => {
    const server = createServer({ flags: { enterprise: true, blocked: false, restricted: false } });
    const result = toggleServer(server);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('enterprise');
  });

  it('fails for blocked servers', () => {
    const server = createServer({ flags: { enterprise: false, blocked: true, restricted: false } });
    const result = toggleServer(server);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('fails for restricted servers that are off', () => {
    const server = createServer({
      state: 'off',
      flags: { enterprise: false, blocked: false, restricted: true },
    });
    const result = toggleServer(server);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('allowlist');
  });

  it('succeeds for normal servers', () => {
    const server = createServer({ state: 'off' });
    const result = toggleServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('green');
  });

  it('toggles from green to orange', () => {
    const server = createServer({ state: 'on', runtime: 'unknown' });
    const result = toggleServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('orange');
  });

  it('toggles from orange to red', () => {
    const server = createServer({ state: 'on', runtime: 'stopped' });
    const result = toggleServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('red');
  });
});

describe('applyToggle', () => {
  it('applies red state correctly', () => {
    const server = createServer({ state: 'on' });
    const result = applyToggle(server, 'red');
    expect(result.state).toBe('off');
    expect(result.runtime).toBe('unknown');
  });

  it('applies green state correctly', () => {
    const server = createServer({ state: 'off' });
    const result = applyToggle(server, 'green');
    expect(result.state).toBe('on');
    expect(result.runtime).toBe('unknown');
  });

  it('applies orange state correctly', () => {
    const server = createServer({ state: 'off' });
    const result = applyToggle(server, 'orange');
    expect(result.state).toBe('on');
    expect(result.runtime).toBe('stopped');
  });

  it('does not mutate original server', () => {
    const server = createServer({ state: 'on' });
    const result = applyToggle(server, 'red');
    expect(server.state).toBe('on');
    expect(result.state).toBe('off');
  });
});

describe('enableServer', () => {
  it('fails for enterprise servers', () => {
    const server = createServer({ flags: { enterprise: true, blocked: false, restricted: false } });
    const result = enableServer(server);
    expect(result.success).toBe(false);
  });

  it('fails for blocked servers', () => {
    const server = createServer({ flags: { enterprise: false, blocked: true, restricted: false } });
    const result = enableServer(server);
    expect(result.success).toBe(false);
  });

  it('fails for restricted servers', () => {
    const server = createServer({ flags: { enterprise: false, blocked: false, restricted: true } });
    const result = enableServer(server);
    expect(result.success).toBe(false);
  });

  it('succeeds for normal servers', () => {
    const server = createServer();
    const result = enableServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('green');
  });
});

describe('disableServer', () => {
  it('fails for enterprise servers', () => {
    const server = createServer({ flags: { enterprise: true, blocked: false, restricted: false } });
    const result = disableServer(server);
    expect(result.success).toBe(false);
  });

  it('succeeds for blocked servers (can disable)', () => {
    const server = createServer({ flags: { enterprise: false, blocked: true, restricted: false } });
    const result = disableServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('red');
  });

  it('succeeds for normal servers', () => {
    const server = createServer();
    const result = disableServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('red');
  });
});

describe('pauseServer', () => {
  it('fails for enterprise servers', () => {
    const server = createServer({ flags: { enterprise: true, blocked: false, restricted: false } });
    const result = pauseServer(server);
    expect(result.success).toBe(false);
  });

  it('fails for blocked servers', () => {
    const server = createServer({ flags: { enterprise: false, blocked: true, restricted: false } });
    const result = pauseServer(server);
    expect(result.success).toBe(false);
  });

  it('succeeds for normal servers', () => {
    const server = createServer();
    const result = pauseServer(server);
    expect(result.success).toBe(true);
    expect(result.newState).toBe('orange');
  });
});

describe('applyStrictDisable', () => {
  it('converts orange servers to red', () => {
    const servers = [
      createServer({ name: 'a', state: 'on', runtime: 'stopped' }), // orange
      createServer({ name: 'b', state: 'on', runtime: 'unknown' }), // green
      createServer({ name: 'c', state: 'off' }), // red
    ];

    const result = applyStrictDisable(servers);

    expect(getDisplayState(result[0])).toBe('red'); // was orange
    expect(getDisplayState(result[1])).toBe('green'); // unchanged
    expect(getDisplayState(result[2])).toBe('red'); // unchanged
  });

  it('preserves non-orange servers', () => {
    const servers = [
      createServer({ name: 'a', state: 'on', runtime: 'running' }),
      createServer({ name: 'b', state: 'off' }),
    ];

    const result = applyStrictDisable(servers);

    expect(result[0].state).toBe('on');
    expect(result[1].state).toBe('off');
  });
});

describe('enableAllServers', () => {
  it('enables all non-enterprise servers', () => {
    const servers = [
      createServer({ name: 'a', state: 'off' }),
      createServer({ name: 'b', state: 'off' }),
      createServer({
        name: 'enterprise',
        state: 'off',
        flags: { enterprise: true, blocked: false, restricted: false },
      }),
    ];

    const result = enableAllServers(servers);

    expect(getDisplayState(result[0])).toBe('green');
    expect(getDisplayState(result[1])).toBe('green');
    expect(getDisplayState(result[2])).toBe('red'); // enterprise unchanged
  });

  it('skips blocked and restricted servers', () => {
    const servers = [
      createServer({ name: 'a', state: 'off' }),
      createServer({
        name: 'blocked',
        state: 'off',
        flags: { enterprise: false, blocked: true, restricted: false },
      }),
      createServer({
        name: 'restricted',
        state: 'off',
        flags: { enterprise: false, blocked: false, restricted: true },
      }),
    ];

    const result = enableAllServers(servers);

    expect(getDisplayState(result[0])).toBe('green');
    expect(getDisplayState(result[1])).toBe('red'); // blocked unchanged
    expect(getDisplayState(result[2])).toBe('red'); // restricted unchanged
  });
});

describe('disableAllServers', () => {
  it('disables all non-enterprise servers', () => {
    const servers = [
      createServer({ name: 'a', state: 'on' }),
      createServer({ name: 'b', state: 'on', runtime: 'stopped' }),
      createServer({
        name: 'enterprise',
        state: 'on',
        flags: { enterprise: true, blocked: false, restricted: false },
      }),
    ];

    const result = disableAllServers(servers);

    expect(getDisplayState(result[0])).toBe('red');
    expect(getDisplayState(result[1])).toBe('red');
    expect(getDisplayState(result[2])).toBe('green'); // enterprise unchanged
  });
});
