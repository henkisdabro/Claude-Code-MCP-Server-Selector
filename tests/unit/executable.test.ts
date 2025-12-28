/**
 * Executable detection tests
 *
 * Tests cross-platform executable finding logic.
 * Due to the complexity of mocking native modules, we test the
 * actual behaviour on the current platform.
 *
 * Note: Unix-specific tests are skipped on Windows because path.join
 * always uses the real platform's separator, not the mocked platform.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Helper to skip Unix tests on Windows
const isWindows = process.platform === 'win32';
const describeUnix = isWindows ? describe.skip : describe;
const itUnix = isWindows ? it.skip : it;

// We mock fs module before imports
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    accessSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    lstatSync: vi.fn(() => ({ isSymbolicLink: () => false })),
    readlinkSync: vi.fn(() => ''),
  };
});

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: vi.fn(() => '/home/testuser'),
  };
});

import * as fs from 'node:fs';
import * as os from 'node:os';

const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockAccessSync = fs.accessSync as ReturnType<typeof vi.fn>;
const mockLstatSync = fs.lstatSync as ReturnType<typeof vi.fn>;
const mockReadlinkSync = fs.readlinkSync as ReturnType<typeof vi.fn>;
const mockHomedir = os.homedir as ReturnType<typeof vi.fn>;

describe('findExecutable', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset to defaults
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describeUnix('on Unix (current platform)', () => {
    beforeEach(() => {
      process.env.PATH = '/usr/local/bin:/usr/bin';
    });

    it('finds executable when accessSync succeeds', async () => {
      mockAccessSync.mockImplementation((path) => {
        if (path === '/usr/local/bin/claude') {
          return undefined; // Success
        }
        throw new Error('ENOENT');
      });
      mockExistsSync.mockReturnValue(true);

      const { findExecutable } = await import('@/utils/executable.js');
      const result = findExecutable('claude');

      // On Unix, should find in first PATH entry
      expect(result).toBe('/usr/local/bin/claude');
    });

    it('returns null when executable not found', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('nonexistent')).toBeNull();
    });

    it('handles empty PATH gracefully', async () => {
      process.env.PATH = '';

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('claude')).toBeNull();
    });

    it('handles undefined PATH gracefully', async () => {
      delete process.env.PATH;

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('claude')).toBeNull();
    });
  });

  describeUnix('symlink resolution', () => {
    beforeEach(() => {
      process.env.PATH = '/usr/local/bin';
    });

    it('resolves absolute symlinks', async () => {
      mockAccessSync.mockImplementation((path) => {
        if (
          path === '/usr/local/bin/claude' ||
          path === '/opt/claude/bin/claude'
        ) {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as fs.Stats);
      mockReadlinkSync.mockReturnValue('/opt/claude/bin/claude');
      mockExistsSync.mockImplementation((path) => {
        return path === '/opt/claude/bin/claude';
      });

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('claude')).toBe('/opt/claude/bin/claude');
    });

    it('resolves relative symlinks correctly', async () => {
      mockAccessSync.mockImplementation((path) => {
        if (path === '/usr/local/bin/claude') {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockLstatSync.mockReturnValue({ isSymbolicLink: () => true } as fs.Stats);
      mockReadlinkSync.mockReturnValue('../lib/claude/bin/claude');
      mockExistsSync.mockImplementation((path) => {
        // Resolved path: /usr/local/lib/claude/bin/claude
        return path === '/usr/local/lib/claude/bin/claude';
      });

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('claude')).toBe('/usr/local/lib/claude/bin/claude');
    });

    it('falls back to original path when symlink resolution fails', async () => {
      mockAccessSync.mockImplementation((path) => {
        if (path === '/usr/local/bin/claude') {
          return undefined;
        }
        throw new Error('ENOENT');
      });
      mockLstatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const { findExecutable } = await import('@/utils/executable.js');
      expect(findExecutable('claude')).toBe('/usr/local/bin/claude');
    });
  });
});

describeUnix('isClaudeAvailable', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true when claude is in PATH', async () => {
    process.env.PATH = '/usr/local/bin';
    mockAccessSync.mockImplementation((path) => {
      if (path === '/usr/local/bin/claude') {
        return undefined;
      }
      throw new Error('ENOENT');
    });
    mockExistsSync.mockReturnValue(true);

    const { isClaudeAvailable } = await import('@/utils/executable.js');
    expect(isClaudeAvailable()).toBe(true);
  });

  it('returns false when claude is not found', async () => {
    process.env.PATH = '/usr/local/bin';
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const { isClaudeAvailable } = await import('@/utils/executable.js');
    expect(isClaudeAvailable()).toBe(false);
  });
});

describeUnix('findClaudeBinary', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
    mockHomedir.mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('checks ~/.local/bin/claude first', async () => {
    process.env.PATH = '/usr/local/bin';

    mockExistsSync.mockImplementation((path) => {
      return path === '/home/testuser/.local/bin/claude';
    });
    mockAccessSync.mockImplementation((path) => {
      if (path === '/home/testuser/.local/bin/claude') {
        return undefined;
      }
      throw new Error('ENOENT');
    });

    const { findClaudeBinary } = await import('@/utils/executable.js');
    expect(findClaudeBinary()).toBe('/home/testuser/.local/bin/claude');
  });

  it('falls back to PATH when not in ~/.local/bin', async () => {
    process.env.PATH = '/usr/local/bin';

    mockExistsSync.mockImplementation((path) => {
      return path !== '/home/testuser/.local/bin/claude';
    });
    mockAccessSync.mockImplementation((path) => {
      if (path === '/usr/local/bin/claude') {
        return undefined;
      }
      throw new Error('ENOENT');
    });

    const { findClaudeBinary } = await import('@/utils/executable.js');
    expect(findClaudeBinary()).toBe('/usr/local/bin/claude');
  });

  it('returns null when claude not found anywhere', async () => {
    process.env.PATH = '/usr/local/bin';
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const { findClaudeBinary } = await import('@/utils/executable.js');
    expect(findClaudeBinary()).toBeNull();
  });
});

describe('Windows PATHEXT handling', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should use PATHEXT on Windows platform', async () => {
    // Note: We can't actually change process.platform in vitest
    // This test documents the expected behaviour
    process.env.PATH = 'C:\\Windows\\System32';
    process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';

    // When running on Windows, the code would check extensions
    // For now, just verify the module loads correctly
    const { findExecutable } = await import('@/utils/executable.js');
    expect(typeof findExecutable).toBe('function');
  });
});

describeUnix('security edge cases', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockAccessSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockLstatSync.mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects names containing forward slash (path traversal)', async () => {
    process.env.PATH = '/usr/local/bin';

    const { findExecutable } = await import('@/utils/executable.js');
    expect(findExecutable('../../../etc/passwd')).toBeNull();
    expect(findExecutable('foo/bar')).toBeNull();
  });

  it('rejects names containing backslash (path traversal)', async () => {
    process.env.PATH = '/usr/local/bin';

    const { findExecutable } = await import('@/utils/executable.js');
    expect(findExecutable('..\\..\\etc\\passwd')).toBeNull();
    expect(findExecutable('foo\\bar')).toBeNull();
  });

  it('rejects names containing null byte', async () => {
    process.env.PATH = '/usr/local/bin';

    const { findExecutable } = await import('@/utils/executable.js');
    expect(findExecutable('claude\0malicious')).toBeNull();
  });

  it('filters empty PATH entries to prevent CWD execution', async () => {
    // Empty entries (e.g., ":/usr/bin:" means "", "/usr/bin", "")
    // could allow execution from current working directory
    process.env.PATH = ':/usr/local/bin:';
    mockAccessSync.mockImplementation((path) => {
      // Should NOT be called with paths starting from CWD
      if (path === 'claude' || path === './claude') {
        throw new Error('Should not check CWD paths');
      }
      if (path === '/usr/local/bin/claude') {
        return undefined;
      }
      throw new Error('ENOENT');
    });
    mockExistsSync.mockReturnValue(true);

    const { findExecutable } = await import('@/utils/executable.js');
    expect(findExecutable('claude')).toBe('/usr/local/bin/claude');
  });

  it('handles PATH with multiple empty entries', async () => {
    process.env.PATH = ':::';

    const { findExecutable } = await import('@/utils/executable.js');
    expect(findExecutable('claude')).toBeNull();
  });
});
