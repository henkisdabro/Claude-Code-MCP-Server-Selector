/**
 * Main TUI Application
 *
 * React Ink application for interactive server selection.
 */

import React, { useEffect } from 'react';
import { Box, Text, useApp, useStdin } from 'ink';
import { Spinner } from '@inkjs/ui';
import { Header } from './components/Header.js';
import { ServerList } from './components/ServerList.js';
import { Preview } from './components/Preview.js';
import { StatusBar } from './components/StatusBar.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { InputDialog } from './components/InputDialog.js';
import { InstallDialog } from './components/InstallDialog.js';
import { MigrateDialog } from './components/MigrateDialog.js';
import { SearchBar } from './components/SearchBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { ToastContainer } from './components/Toast.js';
import { useKeyBindings } from './hooks/useKeyBindings.js';
import { useTerminalResize } from './hooks/useTerminalResize.js';
import { useTuiStore } from './store/index.js';
import { getDisplayState } from '@/core/servers/toggle.js';
import { colors } from './styles/colors.js';
import { isCompactMode } from '@/utils/terminal.js';

interface AppProps {
  cwd: string;
  strictDisable?: boolean;
  onSaveComplete?: () => void;
}

export const App: React.FC<AppProps> = ({ cwd, strictDisable, onSaveComplete }) => {
  const { exit } = useApp();
  const { setRawMode } = useStdin();

  // Track terminal dimensions for responsive layout
  const { columns } = useTerminalResize();
  const compact = isCompactMode(columns);

  // Store state
  const {
    servers,
    selectedIndex,
    filter,
    mode,
    confirmTarget,
    loading,
    error,
    dirty,
    notifications,
    load,
    moveSelection,
    setFilter,
    setMode,
    toggle,
    enableAll,
    disableAll,
    addServer,
    removeServer,
    hardDisablePlugin,
    migrateServer,
    installPlugin,
    refreshRuntimeStatus,
    save,
    openSearch,
    dismissNotification,
    addNotification,
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
      const selected = getSelectedServer();
      if (selected?.sourceType.startsWith('direct')) {
        setMode('migrate', selected.name);
      }
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
    onInstall: () => setMode('install'),
    onRemove: () => {
      const selected = getSelectedServer();
      if (selected && !selected.flags.enterprise) {
        setMode('confirm-delete', selected.name);
      }
    },
    onRefresh: () => {
      refreshRuntimeStatus();
    },
    onSetFilter: setFilter,
    onSearch: openSearch,
    onHelp: () => setMode('help'),
    onSave: async () => {
      const success = await save(cwd);
      if (success) {
        addNotification('success', 'Changes saved');
        onSaveComplete?.();
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
        <Spinner label="Loading servers..." />
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

  // Find target server for dialogs
  const targetServer = confirmTarget
    ? servers.find((s) => s.name === confirmTarget)
    : selectedServer;

  // Render dialog overlays
  const renderDialog = () => {
    switch (mode) {
      case 'confirm-delete':
        if (!targetServer) return null;
        return (
          <ConfirmDialog
            title="Delete Server"
            message={`Remove "${targetServer.name}" from ${targetServer.definitionFile}?`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            variant="danger"
            onConfirm={() => {
              removeServer(targetServer.name);
            }}
            onCancel={() => setMode('list')}
          />
        );

      case 'confirm-hard-disable':
        if (!targetServer) return null;
        return (
          <ConfirmDialog
            title="Hard Disable Plugin"
            message={`Set enabledPlugins["${targetServer.name}"] = false?\n\nThis will completely hide the plugin from Claude UI.`}
            confirmLabel="Disable"
            cancelLabel="Cancel"
            variant="warning"
            onConfirm={() => {
              hardDisablePlugin(targetServer.name);
            }}
            onCancel={() => setMode('list')}
          />
        );

      case 'add':
        return (
          <InputDialog
            title="Add New Server"
            placeholder="Enter server name..."
            onSubmit={(name) => {
              addServer(name);
            }}
            onCancel={() => setMode('list')}
            validate={(name) => {
              if (!name.trim()) return 'Name is required';
              if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
                return 'Name can only contain letters, numbers, hyphens, and underscores';
              }
              if (servers.some((s) => s.name === name)) {
                return 'Server with this name already exists';
              }
              return null;
            }}
          />
        );

      case 'install':
        return (
          <InstallDialog
            onInstall={async (pluginName, marketplace) => {
              await installPlugin(pluginName, marketplace, cwd);
            }}
            onCancel={() => setMode('list')}
          />
        );

      case 'migrate':
        if (!targetServer) return null;
        return (
          <MigrateDialog
            server={targetServer}
            onConfirm={async () => {
              await migrateServer(cwd);
            }}
            onCancel={() => setMode('list')}
          />
        );

      case 'help':
        return <HelpOverlay onClose={() => setMode('list')} />;

      default:
        return null;
    }
  };

  const dialog = renderDialog();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header with stats */}
      <Header
        total={servers.length}
        enabled={enabledCount}
        disabled={disabledCount}
        dirty={dirty}
      />

      {/* Main content or Dialog */}
      {dialog ? (
        <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
          {dialog}
        </Box>
      ) : (
        <>
          {/* Search bar (when active) */}
          {mode === 'search' && <SearchBar />}

          {/* Main content: Server list + Preview (preview hidden in compact mode) */}
          <Box flexDirection="row" flexGrow={1}>
            <ServerList
              servers={filteredServers}
              selectedIndex={selectedIndex}
              filter={filter}
              fullWidth={compact}
              terminalColumns={columns}
            />
            {!compact && <Preview server={selectedServer} />}
          </Box>

          {/* Toast notifications */}
          <ToastContainer
            notifications={notifications}
            onDismiss={dismissNotification}
          />

          {/* Status bar with shortcuts */}
          <StatusBar filter={filter} />
        </>
      )}
    </Box>
  );
};
