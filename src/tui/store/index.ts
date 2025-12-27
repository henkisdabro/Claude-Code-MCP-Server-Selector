/**
 * TUI state management with Zustand
 */

import { create } from 'zustand';
import type { Server, FilterType } from '@/types/index.js';
import { extractRawDefinitions } from '@/core/config/discovery.js';
import { resolveServers } from '@/core/config/precedence.js';
import { saveServerStates } from '@/core/config/state.js';
import {
  toggleServer,
  applyToggle,
  enableAllServers,
  disableAllServers,
  applyStrictDisable,
  getDisplayState,
} from '@/core/servers/toggle.js';

export type TuiMode = 'list' | 'add' | 'install' | 'confirm-delete' | 'confirm-hard-disable' | 'migrate';

interface TuiState {
  // Data
  servers: Server[];
  originalServers: Server[];

  // Selection
  selectedIndex: number;
  filter: FilterType;

  // UI state
  mode: TuiMode;
  confirmTarget: string | null;
  loading: boolean;
  error: string | null;
  dirty: boolean;

  // Actions
  load: (cwd: string, strictDisable?: boolean) => Promise<void>;
  setSelectedIndex: (index: number) => void;
  moveSelection: (delta: number) => void;
  setFilter: (filter: FilterType) => void;
  setMode: (mode: TuiMode, target?: string) => void;

  // Server operations
  toggle: () => void;
  enableAll: () => void;
  disableAll: () => void;
  addServer: (name: string) => void;
  removeServer: (name: string) => void;
  hardDisablePlugin: (name: string) => void;
  migrateServer: (cwd: string) => Promise<boolean>;
  installPlugin: (pluginName: string, marketplace: string, cwd: string) => Promise<boolean>;
  refreshRuntimeStatus: () => Promise<void>;
  save: (cwd: string) => Promise<boolean>;

  // Computed
  getFilteredServers: () => Server[];
  getSelectedServer: () => Server | undefined;
}

export const useTuiStore = create<TuiState>((set, get) => ({
  // Initial state
  servers: [],
  originalServers: [],
  selectedIndex: 0,
  filter: 'all',
  mode: 'list',
  confirmTarget: null,
  loading: true,
  error: null,
  dirty: false,

  // Load servers from config
  load: async (cwd: string, strictDisable?: boolean) => {
    set({ loading: true, error: null });

    try {
      const rawData = await extractRawDefinitions(cwd);
      let servers = resolveServers(rawData);

      // Apply strict-disable if requested
      if (strictDisable) {
        servers = applyStrictDisable(servers);
      }

      set({
        servers,
        originalServers: JSON.parse(JSON.stringify(servers)),
        loading: false,
        selectedIndex: 0,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load servers',
        loading: false,
      });
    }
  },

  // Selection
  setSelectedIndex: (index: number) => {
    const filtered = get().getFilteredServers();
    const clamped = Math.max(0, Math.min(index, filtered.length - 1));
    set({ selectedIndex: clamped });
  },

  moveSelection: (delta: number) => {
    const { selectedIndex, getFilteredServers } = get();
    const filtered = getFilteredServers();
    const newIndex = Math.max(0, Math.min(selectedIndex + delta, filtered.length - 1));
    set({ selectedIndex: newIndex });
  },

  // Filter
  setFilter: (filter: FilterType) => {
    set({ filter, selectedIndex: 0 });
  },

  // Mode
  setMode: (mode: TuiMode, target?: string) => {
    set({ mode, confirmTarget: target ?? null });
  },

  // Toggle current server
  toggle: () => {
    const { servers, getSelectedServer } = get();
    const selected = getSelectedServer();

    if (!selected) return;

    const result = toggleServer(selected);
    if (!result.success || !result.newState) return;

    const index = servers.findIndex((s) => s.name === selected.name);
    if (index === -1) return;

    const updated = [...servers];
    updated[index] = applyToggle(selected, result.newState);

    set({ servers: updated, dirty: true });
  },

  // Enable all
  enableAll: () => {
    const { servers } = get();
    set({ servers: enableAllServers(servers), dirty: true });
  },

  // Disable all
  disableAll: () => {
    const { servers } = get();
    set({ servers: disableAllServers(servers), dirty: true });
  },

  // Add server (placeholder - needs .mcp.json integration)
  addServer: (name: string) => {
    const { servers } = get();
    if (servers.some((s) => s.name === name)) return;

    const newServer: Server = {
      name,
      state: 'on',
      scope: 'project',
      definitionFile: './.mcp.json',
      sourceType: 'mcpjson',
      flags: { enterprise: false, blocked: false, restricted: false },
      runtime: 'unknown',
    };

    set({
      servers: [...servers, newServer].sort((a, b) => a.name.localeCompare(b.name)),
      dirty: true,
      mode: 'list',
    });
  },

  // Remove server
  removeServer: (name: string) => {
    const { servers } = get();
    set({
      servers: servers.filter((s) => s.name !== name),
      dirty: true,
      mode: 'list',
      confirmTarget: null,
    });
  },

  // Hard disable plugin (sets enabledPlugins[name] = false)
  hardDisablePlugin: (name: string) => {
    const { servers } = get();
    const server = servers.find((s) => s.name === name);

    if (!server || server.sourceType !== 'plugin') {
      set({ mode: 'list', confirmTarget: null });
      return;
    }

    // Mark as hard-disabled by setting state to off
    // The save function will write enabledPlugins[name] = false
    const updated = servers.map((s) =>
      s.name === name
        ? { ...s, state: 'off' as const, flags: { ...s.flags, hardDisabled: true } }
        : s
    );

    set({
      servers: updated,
      dirty: true,
      mode: 'list',
      confirmTarget: null,
    });
  },

  // Migrate direct server to .mcp.json
  migrateServer: async (cwd: string) => {
    const { servers, getSelectedServer } = get();
    const selected = getSelectedServer();

    if (!selected) {
      set({ mode: 'list', confirmTarget: null });
      return false;
    }

    // Only migrate direct servers
    if (!selected.sourceType.startsWith('direct')) {
      set({
        error: 'Only Direct servers can be migrated',
        mode: 'list',
        confirmTarget: null,
      });
      return false;
    }

    try {
      // Import the migration function dynamically
      const { migrateServerToProject } = await import('@/core/config/migration.js');

      const result = await migrateServerToProject(selected, cwd);

      if (!result.success) {
        set({
          error: result.error || 'Migration failed',
          mode: 'list',
          confirmTarget: null,
        });
        return false;
      }

      // Update the server in our list to reflect the new location
      const updated = servers.map((s) =>
        s.name === selected.name
          ? {
              ...s,
              sourceType: 'mcpjson' as const,
              scope: 'project' as const,
              definitionFile: './.mcp.json',
            }
          : s
      );

      set({
        servers: updated,
        dirty: false, // Migration saves directly, so not dirty
        mode: 'list',
        confirmTarget: null,
      });

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Migration failed',
        mode: 'list',
        confirmTarget: null,
      });
      return false;
    }
  },

  // Install plugin from marketplace
  installPlugin: async (pluginName: string, marketplace: string, cwd: string) => {
    try {
      const { installPlugin } = await import('@/core/plugins/install.js');

      const result = await installPlugin(pluginName, marketplace);

      if (!result.success) {
        set({
          error: result.error || 'Installation failed',
          mode: 'list',
        });
        return false;
      }

      // Reload servers to pick up the newly installed plugin
      const rawData = await extractRawDefinitions(cwd);
      const servers = resolveServers(rawData);

      set({
        servers,
        originalServers: JSON.parse(JSON.stringify(servers)),
        mode: 'list',
        dirty: false,
      });

      return true;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Installation failed',
        mode: 'list',
      });
      return false;
    }
  },

  // Refresh runtime status by calling claude mcp list
  refreshRuntimeStatus: async () => {
    const { servers } = get();

    try {
      // Import the runtime check function dynamically
      const { getRuntimeStatus } = await import('@/core/config/runtime.js');

      const runtimeStates = await getRuntimeStatus();

      // Update servers with runtime status
      const updated = servers.map((s) => ({
        ...s,
        runtime: runtimeStates[s.name] || 'unknown',
      }));

      set({ servers: updated });
    } catch {
      // Silently fail - runtime status is optional
    }
  },

  // Save changes
  save: async (cwd: string) => {
    const { servers, dirty } = get();

    if (!dirty) return true;

    try {
      const { errors } = await saveServerStates(servers, cwd);

      if (errors.length > 0) {
        set({ error: errors.join(', ') });
        return false;
      }

      set({ dirty: false, originalServers: JSON.parse(JSON.stringify(servers)) });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save' });
      return false;
    }
  },

  // Get filtered servers
  getFilteredServers: () => {
    const { servers, filter } = get();

    switch (filter) {
      case 'all':
        return servers;
      case 'mcpjson':
        return servers.filter((s) => s.sourceType === 'mcpjson');
      case 'direct':
        return servers.filter((s) => s.sourceType.startsWith('direct'));
      case 'plugin':
        return servers.filter((s) => s.sourceType === 'plugin');
      case 'enterprise':
        return servers.filter((s) => s.flags.enterprise);
      case 'blocked':
        return servers.filter((s) => s.flags.blocked || s.flags.restricted);
      case 'orange':
        return servers.filter((s) => getDisplayState(s) === 'orange');
      default:
        return servers;
    }
  },

  // Get selected server
  getSelectedServer: () => {
    const { selectedIndex, getFilteredServers } = get();
    const filtered = getFilteredServers();
    return filtered[selectedIndex];
  },
}));
