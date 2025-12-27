/**
 * Server toggle logic
 *
 * Implements the 3-way toggle cycle:
 * - RED (off) -> GREEN (on) -> ORANGE (paused) -> RED
 *
 * RED: state=off, server is disabled
 * GREEN: state=on, server is enabled and will run
 * ORANGE: state=on but in disabledMcpServers (enabled in config, runtime paused)
 */

import type {
  Server,
  DisplayState,
  ToggleResult,
} from '@/types/index.js';

/**
 * Get the display state from a server
 */
export function getDisplayState(server: Server): DisplayState {
  if (server.state === 'off') return 'red';
  if (server.runtime === 'stopped') return 'orange';
  return 'green';
}

/**
 * Get the next state in the toggle cycle
 */
export function getNextDisplayState(current: DisplayState): DisplayState {
  switch (current) {
    case 'red':
      return 'green';
    case 'green':
      return 'orange';
    case 'orange':
      return 'red';
  }
}

/**
 * Toggle a server to the next state
 *
 * Returns the updated server object (does not mutate)
 */
export function toggleServer(server: Server): ToggleResult {
  // Cannot toggle enterprise-managed servers
  if (server.flags.enterprise) {
    return {
      success: false,
      reason: 'Cannot modify enterprise-managed server',
    };
  }

  // Cannot toggle blocked servers
  if (server.flags.blocked) {
    return {
      success: false,
      reason: 'Server is blocked by enterprise policy',
    };
  }

  // Cannot enable restricted servers
  if (server.flags.restricted && server.state === 'off') {
    return {
      success: false,
      reason: 'Server is not in enterprise allowlist',
    };
  }

  const currentState = getDisplayState(server);
  const nextState = getNextDisplayState(currentState);

  return {
    success: true,
    newState: nextState,
  };
}

/**
 * Apply a toggle result to a server
 */
export function applyToggle(server: Server, newState: DisplayState): Server {
  switch (newState) {
    case 'red':
      return {
        ...server,
        state: 'off',
        runtime: 'unknown',
      };
    case 'green':
      return {
        ...server,
        state: 'on',
        runtime: 'unknown', // Will be 'running' when Claude starts
      };
    case 'orange':
      return {
        ...server,
        state: 'on',
        runtime: 'stopped',
      };
  }
}

/**
 * Enable a server (set to GREEN)
 */
export function enableServer(server: Server): ToggleResult {
  if (server.flags.enterprise) {
    return { success: false, reason: 'Cannot modify enterprise-managed server' };
  }
  if (server.flags.blocked) {
    return { success: false, reason: 'Server is blocked by enterprise policy' };
  }
  if (server.flags.restricted) {
    return { success: false, reason: 'Server is not in enterprise allowlist' };
  }

  return { success: true, newState: 'green' };
}

/**
 * Disable a server (set to RED)
 */
export function disableServer(server: Server): ToggleResult {
  if (server.flags.enterprise) {
    return { success: false, reason: 'Cannot modify enterprise-managed server' };
  }

  return { success: true, newState: 'red' };
}

/**
 * Pause a server (set to ORANGE - enabled but runtime disabled)
 */
export function pauseServer(server: Server): ToggleResult {
  if (server.flags.enterprise) {
    return { success: false, reason: 'Cannot modify enterprise-managed server' };
  }
  if (server.flags.blocked) {
    return { success: false, reason: 'Server is blocked by enterprise policy' };
  }
  if (server.flags.restricted) {
    return { success: false, reason: 'Server is not in enterprise allowlist' };
  }

  return { success: true, newState: 'orange' };
}

/**
 * Apply strict-disable: Convert all ORANGE servers to RED
 *
 * Used with --strict-disable flag before launching Claude
 */
export function applyStrictDisable(servers: Server[]): Server[] {
  return servers.map((server) => {
    const state = getDisplayState(server);
    if (state === 'orange') {
      return applyToggle(server, 'red');
    }
    return server;
  });
}

/**
 * Enable all non-enterprise servers
 */
export function enableAllServers(servers: Server[]): Server[] {
  return servers.map((server) => {
    const result = enableServer(server);
    if (result.success && result.newState) {
      return applyToggle(server, result.newState);
    }
    return server;
  });
}

/**
 * Disable all non-enterprise servers
 */
export function disableAllServers(servers: Server[]): Server[] {
  return servers.map((server) => {
    const result = disableServer(server);
    if (result.success && result.newState) {
      return applyToggle(server, result.newState);
    }
    return server;
  });
}
