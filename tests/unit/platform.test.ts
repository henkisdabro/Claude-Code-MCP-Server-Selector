/**
 * Platform detection tests
 *
 * Tests platform-specific path resolution and detection logic.
 * Uses vi.mock() to mock native modules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the os module before importing
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    platform: vi.fn(() => 'linux'),
    release: vi.fn(() => '5.15.0-generic'),
    homedir: vi.fn(() => '/home/testuser'),
  };
});

import * as os from 'node:os';

// Cast mocked functions for type safety
const mockPlatform = os.platform as ReturnType<typeof vi.fn>;
const mockRelease = os.release as ReturnType<typeof vi.fn>;
const mockHomedir = os.homedir as ReturnType<typeof vi.fn>;

describe('detectPlatform', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.WSL_DISTRO_NAME;
  });

  afterEach(() => {
    delete process.env.WSL_DISTRO_NAME;
  });

  it('detects macOS from darwin platform', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockRelease.mockReturnValue('23.0.0');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('macos');
  });

  it('detects Windows from win32 platform', async () => {
    mockPlatform.mockReturnValue('win32');
    mockRelease.mockReturnValue('10.0.19045');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('windows');
  });

  it('detects WSL from release string containing microsoft', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.90.1-microsoft-standard-WSL2');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('wsl');
  });

  it('detects WSL from release string containing wsl', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.0-wsl-custom');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('wsl');
  });

  it('detects WSL from WSL_DISTRO_NAME environment variable', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.0-generic');
    process.env.WSL_DISTRO_NAME = 'Ubuntu';

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('wsl');
  });

  it('detects plain Linux without WSL indicators', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.0-generic');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('linux');
  });

  it('defaults to linux for unknown platforms', async () => {
    mockPlatform.mockReturnValue('freebsd');
    mockRelease.mockReturnValue('13.0-RELEASE');

    const { detectPlatform } = await import('@/utils/platform.js');
    expect(detectPlatform()).toBe('linux');
  });
});

describe('getEnterpriseMcpPath', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.WSL_DISTRO_NAME;
  });

  afterEach(() => {
    delete process.env.WSL_DISTRO_NAME;
  });

  it('returns Linux enterprise path', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.0-generic');

    const { getEnterpriseMcpPath } = await import('@/utils/platform.js');
    expect(getEnterpriseMcpPath()).toBe('/etc/claude-code/managed-mcp.json');
  });

  it('returns macOS enterprise path', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockRelease.mockReturnValue('23.0.0');

    const { getEnterpriseMcpPath } = await import('@/utils/platform.js');
    expect(getEnterpriseMcpPath()).toBe(
      '/Library/Application Support/ClaudeCode/managed-mcp.json'
    );
  });

  it('returns Windows enterprise path', async () => {
    mockPlatform.mockReturnValue('win32');
    mockRelease.mockReturnValue('10.0.19045');

    const { getEnterpriseMcpPath } = await import('@/utils/platform.js');
    expect(getEnterpriseMcpPath()).toBe(
      'C:\\ProgramData\\ClaudeCode\\managed-mcp.json'
    );
  });

  it('returns WSL enterprise path (Windows mount)', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.90.1-microsoft-standard-WSL2');

    const { getEnterpriseMcpPath } = await import('@/utils/platform.js');
    expect(getEnterpriseMcpPath()).toBe(
      '/mnt/c/ProgramData/ClaudeCode/managed-mcp.json'
    );
  });
});

describe('getEnterpriseSettingsPath', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.WSL_DISTRO_NAME;
  });

  afterEach(() => {
    delete process.env.WSL_DISTRO_NAME;
  });

  it('returns Linux enterprise settings path', async () => {
    mockPlatform.mockReturnValue('linux');
    mockRelease.mockReturnValue('5.15.0-generic');

    const { getEnterpriseSettingsPath } = await import('@/utils/platform.js');
    expect(getEnterpriseSettingsPath()).toBe(
      '/etc/claude-code/managed-settings.json'
    );
  });

  it('returns macOS enterprise settings path', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockRelease.mockReturnValue('23.0.0');

    const { getEnterpriseSettingsPath } = await import('@/utils/platform.js');
    expect(getEnterpriseSettingsPath()).toBe(
      '/Library/Application Support/ClaudeCode/managed-settings.json'
    );
  });

  it('returns Windows enterprise settings path', async () => {
    mockPlatform.mockReturnValue('win32');
    mockRelease.mockReturnValue('10.0.19045');

    const { getEnterpriseSettingsPath } = await import('@/utils/platform.js');
    expect(getEnterpriseSettingsPath()).toBe(
      'C:\\ProgramData\\ClaudeCode\\managed-settings.json'
    );
  });
});

describe('user path functions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('getClaudeConfigDir uses homedir', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getClaudeConfigDir } = await import('@/utils/platform.js');
    expect(getClaudeConfigDir()).toBe('/home/testuser/.claude');
  });

  it('getClaudeJsonPath uses homedir', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getClaudeJsonPath } = await import('@/utils/platform.js');
    expect(getClaudeJsonPath()).toBe('/home/testuser/.claude.json');
  });

  it('getUserMcpJsonPath uses homedir', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getUserMcpJsonPath } = await import('@/utils/platform.js');
    expect(getUserMcpJsonPath()).toBe('/home/testuser/.mcp.json');
  });

  it('getUserSettingsPath returns settings.json by default', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getUserSettingsPath } = await import('@/utils/platform.js');
    expect(getUserSettingsPath()).toBe('/home/testuser/.claude/settings.json');
  });

  it('getUserSettingsPath returns settings.local.json when local=true', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getUserSettingsPath } = await import('@/utils/platform.js');
    expect(getUserSettingsPath(true)).toBe(
      '/home/testuser/.claude/settings.local.json'
    );
  });

  it('works with macOS-style home directory', async () => {
    mockHomedir.mockReturnValue('/Users/testuser');

    const { getClaudeConfigDir, getClaudeJsonPath } = await import(
      '@/utils/platform.js'
    );
    expect(getClaudeConfigDir()).toBe('/Users/testuser/.claude');
    expect(getClaudeJsonPath()).toBe('/Users/testuser/.claude.json');
  });

  it('works with Windows-style home directory', async () => {
    mockHomedir.mockReturnValue('C:\\Users\\testuser');

    const { getClaudeConfigDir, getClaudeJsonPath } = await import(
      '@/utils/platform.js'
    );
    // path.join handles separators correctly
    expect(getClaudeConfigDir()).toContain('testuser');
    expect(getClaudeConfigDir()).toContain('.claude');
  });
});

describe('project path functions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('getProjectSettingsPath uses provided cwd', async () => {
    const { getProjectSettingsPath } = await import('@/utils/platform.js');
    expect(getProjectSettingsPath('/my/project')).toBe(
      '/my/project/.claude/settings.json'
    );
  });

  it('getProjectSettingsPath returns local variant', async () => {
    const { getProjectSettingsPath } = await import('@/utils/platform.js');
    expect(getProjectSettingsPath('/my/project', true)).toBe(
      '/my/project/.claude/settings.local.json'
    );
  });

  it('getProjectMcpJsonPath uses provided cwd', async () => {
    const { getProjectMcpJsonPath } = await import('@/utils/platform.js');
    expect(getProjectMcpJsonPath('/my/project')).toBe('/my/project/.mcp.json');
  });
});

describe('marketplace path functions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('getMarketplaceDir returns plugins directory', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getMarketplaceDir } = await import('@/utils/platform.js');
    expect(getMarketplaceDir()).toBe('/home/testuser/.claude/plugins');
  });

  it('getMarketplacesDir returns marketplaces subdirectory', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getMarketplacesDir } = await import('@/utils/platform.js');
    expect(getMarketplacesDir()).toBe(
      '/home/testuser/.claude/plugins/marketplaces'
    );
  });

  it('getInstalledPluginsPath returns installed_plugins.json', async () => {
    mockHomedir.mockReturnValue('/home/testuser');

    const { getInstalledPluginsPath } = await import('@/utils/platform.js');
    expect(getInstalledPluginsPath()).toBe(
      '/home/testuser/.claude/plugins/installed_plugins.json'
    );
  });
});
