/**
 * Main TUI Application
 *
 * React Ink application for interactive server selection.
 */

import React, { useEffect } from 'react';
import { Box, Text, useApp, useStdin } from 'ink';
import { Header } from './components/Header.js';
import { ServerList } from './components/ServerList.js';
import { Preview } from './components/Preview.js';
import { StatusBar } from './components/StatusBar.js';
import { useKeyBindings } from './hooks/useKeyBindings.js';
import { useTuiStore } from './store/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { colors } from './styles/colors.js';

interface AppProps {
  cwd: string;
  strictDisable?: boolean;
}

export const App: React.FC<AppProps> = ({ cwd, strictDisable }) => {
  const { exit } = useApp();
  const { setRawMode } = useStdin();

  // Store state
  const {
    servers,
    selectedIndex,
    filter,
    mode,
    loading,
    error,
    dirty,
    load,
    moveSelection,
    setFilter,
    setMode,
    toggle,
    enableAll,
    disableAll,
    save,
    getFilteredServers,
    getSelectedServer,
  } = useTuiStore();

  // Enable raw mode for keyboard input
  useEffect(() => {
    setRawMode(true);
    return () => setRawMode(false);
  }, [setRawMode]);

  // Load servers on mount
  useEffect(() => {
    load(cwd, strictDisable);
  }, [cwd, strictDisable, load]);

  // Set up keyboard bindings
  useKeyBindings({
    mode,
    onMoveUp: () => moveSelection(-1),
    onMoveDown: () => moveSelection(1),
    onPageUp: () => moveSelection(-10),
    onPageDown: () => moveSelection(10),
    onToggle: toggle,
    onMigrate: () => {
      // TODO: Implement migration
    },
    onHardDisable: () => {
      const selected = getSelectedServer();
      if (selected?.sourceType === 'plugin') {
        setMode('confirm-hard-disable', selected.name);
      }
    },
    onEnableAll: enableAll,
    onDisableAll: disableAll,
    onAdd: () => setMode('add'),
    onRemove: () => {
      const selected = getSelectedServer();
      if (selected && !selected.flags.enterprise) {
        setMode('confirm-delete', selected.name);
      }
    },
    onSetFilter: setFilter,
    onSave: async () => {
      const success = await save(cwd);
      if (success) {
        exit();
      }
    },
    onCancel: () => {
      exit();
    },
  });

  // Loading state
  if (loading) {
    return (
      <Box padding={1}>
        <Text color={colors.cyan}>Loading servers...</Text>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={colors.red}>Error: {error}</Text>
        <Text dimColor>Press any key to exit</Text>
      </Box>
    );
  }

  // Calculate stats
  const filteredServers = getFilteredServers();
  const selectedServer = getSelectedServer();
  const enabledCount = servers.filter((s) => getDisplayState(s) !== 'red').length;
  const disabledCount = servers.filter((s) => getDisplayState(s) === 'red').length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with stats */}
      <Header
        total={servers.length}
        enabled={enabledCount}
        disabled={disabledCount}
        dirty={dirty}
      />

      {/* Main content: Server list + Preview */}
      <Box flexDirection="row" flexGrow={1}>
        <ServerList
          servers={filteredServers}
          selectedIndex={selectedIndex}
          filter={filter}
        />
        <Preview server={selectedServer} />
      </Box>

      {/* Status bar with shortcuts */}
      <StatusBar filter={filter} />
    </Box>
  );
};
