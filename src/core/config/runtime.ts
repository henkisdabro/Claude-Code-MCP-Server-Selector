/**
 * Runtime status utilities
 *
 * Queries Claude CLI to get runtime status of MCP servers
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { RuntimeStatus } from '@/types/index.js';
import { isClaudeAvailable } from '@/utils/executable.js';

const execAsync = promisify(exec);

// Re-export for backwards compatibility
export { isClaudeAvailable };

/**
 * Get runtime status of all MCP servers by calling `claude mcp list`
 *
 * @returns Map of server name to runtime status
 */
export async function getRuntimeStatus(): Promise<Record<string, RuntimeStatus>> {
  const runtimeStates: Record<string, RuntimeStatus> = {};

  try {
    // Try to find claude binary
    const { stdout } = await execAsync('claude mcp list', {
      timeout: 5000, // 5 second timeout
    });

    // Parse output - expected format varies, but typically:
    // servername: connected
    // servername: disconnected
    // servername: error
    const lines = stdout.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match patterns like "servername: connected" or "servername (connected)"
      const colonMatch = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(connected|disconnected|error|running|stopped)/i);
      const parenMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*\((connected|disconnected|error|running|stopped)\)/i);

      const match = colonMatch || parenMatch;
      if (match && match[1] && match[2]) {
        const serverName = match[1];
        const status = match[2];
        const normalised = status.toLowerCase();

        if (normalised === 'connected' || normalised === 'running') {
          runtimeStates[serverName] = 'running';
        } else if (normalised === 'disconnected' || normalised === 'stopped' || normalised === 'error') {
          runtimeStates[serverName] = 'stopped';
        }
      }
    }
  } catch {
    // Claude CLI not available or command failed
    // This is expected when not in a Claude session
  }

  return runtimeStates;
}

