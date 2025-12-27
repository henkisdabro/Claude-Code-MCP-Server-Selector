/**
 * Core type definitions for MCP Server Selector
 *
 * These types mirror the data structures used in the Bash version
 * and must maintain exact compatibility with Claude Code's config format.
 */

// ============================================================================
// Server State Types
// ============================================================================

/** Config state: whether the server is enabled or disabled in configuration */
export type ServerState = 'on' | 'off';

/** Runtime status: actual running state (requires FAST_MODE=false to detect) */
export type RuntimeStatus = 'running' | 'stopped' | 'unknown';

/** Source type: how the server was discovered */
export type SourceType = 'mcpjson' | 'direct-global' | 'direct-local' | 'plugin';

/** Scope: where the server configuration is defined */
export type Scope = 'enterprise' | 'local' | 'project' | 'user';

/**
 * Display state for the TUI - combines config state and runtime status
 * - red: Disabled (state=off)
 * - green: Enabled and running (state=on, runtime!=stopped)
 * - orange: Enabled but runtime-disabled (state=on, runtime=stopped)
 */
export type DisplayState = 'red' | 'green' | 'orange';

/** Special flags for server access control */
export interface EnterpriseFlags {
  /** Enterprise-managed server (immutable) */
  enterprise: boolean;
  /** Blocked by enterprise denylist */
  blocked: boolean;
  /** Not in enterprise allowlist (when allowlist is active) */
  restricted: boolean;
}

/** Filter types for the TUI */
export type FilterType =
  | 'all'
  | 'mcpjson'
  | 'direct'
  | 'plugin'
  | 'enterprise'
  | 'blocked'
  | 'orange';

// ============================================================================
// Server Definition Types
// ============================================================================

/** Server transport type */
export type TransportType = 'stdio' | 'http' | 'sse';

/** Server definition as stored in config files */
export interface ServerDefinition {
  /** For stdio transport: the command to run */
  command?: string;
  /** For stdio transport: command arguments */
  args?: string[];
  /** Transport type for URL-based servers */
  type?: 'http' | 'sse';
  /** For http/sse transport: the server URL */
  url?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** HTTP headers (for http/sse) */
  headers?: Record<string, string>;
}

/** Complete server representation with metadata */
export interface Server {
  /** Server name (identifier) */
  name: string;
  /** Current config state */
  state: ServerState;
  /** Where the server is defined */
  scope: Scope;
  /** Path to the definition file */
  definitionFile: string;
  /** How the server was discovered */
  sourceType: SourceType;
  /** Access control flags */
  flags: EnterpriseFlags;
  /** Runtime status (if known) */
  runtime: RuntimeStatus;
  /** The actual server definition (for preview) */
  definition?: ServerDefinition;
  /** Full command array for matching (command + args) */
  command?: string[];
  /** Server URL for http/sse transport matching */
  url?: string;
}

/** Alias for enterprise flags (backward compatibility) */
export type ServerFlags = EnterpriseFlags;

/** Plugin-specific server metadata */
export interface PluginServer extends Server {
  /** Full plugin identifier: plugin-name@marketplace-name */
  pluginName: string;
  /** Marketplace identifier */
  marketplace: string;
  /** Relative path to .mcp.json in plugin repo */
  pluginSource: string;
}

// ============================================================================
// Configuration File Schemas
// ============================================================================

/** ~/.claude.json root configuration */
export interface ClaudeJsonSchema {
  mcpServers?: Record<string, ServerDefinition>;
  projects?: Record<string, ClaudeJsonProjectSchema>;
  disabledMcpServers?: string[];
}

/** ~/.claude.json .projects[path] section */
export interface ClaudeJsonProjectSchema {
  mcpServers?: Record<string, ServerDefinition>;
  disabledMcpServers?: string[];
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
}

/** .mcp.json file schema */
export interface McpJsonSchema {
  mcpServers: Record<string, ServerDefinition>;
}

/** .claude/settings.json or .claude/settings.local.json */
export interface SettingsSchema {
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  enableAllProjectMcpServers?: boolean;
  enabledPlugins?: Record<string, boolean>;
}

/** Enterprise managed-mcp.json */
export interface EnterpriseMcpSchema {
  mcpServers?: Record<string, ServerDefinition>;
}

/** Enterprise managed-settings.json restrictions */
export interface EnterpriseRestriction {
  serverName?: string;
  serverCommand?: string[];
  serverUrl?: string;
}

/** Alias for server restriction matching */
export type ServerRestriction = EnterpriseRestriction;

/** Enterprise managed-settings.json */
export interface EnterpriseSettingsSchema {
  allowedMcpServers?: EnterpriseRestriction[];
  deniedMcpServers?: EnterpriseRestriction[];
  strictKnownMarketplaces?: Array<{
    source: string;
    repo: string;
  }>;
}

/** Marketplace plugin.json or .mcp.json */
export interface MarketplaceSchema {
  plugins?: Array<{
    name: string;
    source?: string;
    mcpServers?: Record<string, ServerDefinition>;
  }>;
  mcpServers?: Record<string, ServerDefinition>;
}

/** Installed plugins file (~/.claude/plugins/installed_plugins.json) */
export interface InstalledPluginsSchema {
  version?: number;
  plugins?: Record<string, InstalledPluginEntry[]>;
}

/** Entry in installed_plugins.json */
export interface InstalledPluginEntry {
  scope: 'user' | 'project';
  installPath: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
  isLocal?: boolean;
}

// ============================================================================
// Internal State Types
// ============================================================================

/** Configuration source descriptor */
export interface ConfigSource {
  /** Absolute path to the config file */
  path: string;
  /** Scope of this config source */
  scope: Scope;
  /** Whether the file exists */
  exists: boolean;
  /** Type of configuration file */
  type: 'settings' | 'mcp' | 'claude' | 'enterprise' | 'plugin' | 'installed-plugins';
}

/** Raw definition before precedence resolution */
export interface RawDefinition {
  type: 'def' | 'enable' | 'disable' | 'disable-plugin' | 'runtime-disable';
  server: string;
  scope: Scope;
  file: string;
  sourceType?: SourceType;
  definition?: ServerDefinition;
}

/** Enterprise policy after parsing */
export interface EnterprisePolicy {
  allowedServers: string[];
  deniedServers: string[];
  allowedCommands: string[][];
  deniedCommands: string[][];
  allowedUrls: string[];
  deniedUrls: string[];
  strictMarketplaces: Array<{ source: string; repo: string }>;
  exclusiveMode: boolean;
  lockdownMode: boolean;
}

// ============================================================================
// CLI Types
// ============================================================================

/** CLI mode of operation */
export type CliMode =
  | 'tui'
  | 'help'
  | 'version'
  | 'audit'
  | 'validate'
  | 'debug-precedence'
  | 'fix-config'
  | 'restore-plugin'
  | 'rollback'
  | 'export-disabled'
  | 'sync-check'
  | 'context-report'
  | 'enable'
  | 'disable';

/** CLI options */
export interface CliOptions {
  mode: CliMode;
  strictDisable?: boolean;
  quietMode?: boolean;
  jsonOutput?: boolean;
  csvOutput?: boolean;
  applyFix?: boolean;
  all?: boolean;
  servers?: string[];
  serverArg?: string;
  claudeArgs?: string[];
}

// ============================================================================
// Result Types
// ============================================================================

/** Audit issue */
export interface AuditIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  message: string;
  suggestion?: string;
  fixable?: boolean;
  fixType?: 'remove-key' | 'move-array' | 'remove-explicit-false';
  fixData?: Record<string, unknown>;
}

/** Audit result */
export interface AuditResult {
  issues: AuditIssue[];
  passedChecks: string[];
}

/** Toggle result */
export interface ToggleResult {
  success: boolean;
  newState?: DisplayState;
  reason?: string;
}

/** Access check result */
export interface AccessResult {
  allowed: boolean;
  reason?: 'no_restrictions' | 'in_allowlist' | 'in_denylist' |
           'not_in_allowlist' | 'enterprise_only' | 'enterprise_managed';
}

// ============================================================================
// Utility Types
// ============================================================================

/** Scope priority for precedence resolution */
export const SCOPE_PRIORITY: Record<Scope, number> = {
  enterprise: 4,
  local: 3,
  project: 2,
  user: 1,
} as const;

/** Get display state from server */
export function getDisplayState(server: Server): DisplayState {
  if (server.state === 'off') return 'red';
  if (server.runtime === 'stopped') return 'orange';
  return 'green';
}

/** Get next toggle state in cycle: red -> green -> orange -> red */
export function getNextDisplayState(current: DisplayState): DisplayState {
  const cycle: Record<DisplayState, DisplayState> = {
    red: 'green',
    green: 'orange',
    orange: 'red',
  };
  return cycle[current];
}

/** Get transport type from server definition */
export function getTransportType(def: ServerDefinition): TransportType {
  if (def.type === 'http') return 'http';
  if (def.type === 'sse') return 'sse';
  return 'stdio';
}
