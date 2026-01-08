/**
 * Plugin utility tests
 *
 * Tests for plugin name format conversion utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  getPluginKey,
  getPluginDisableFormat,
  parsePluginDisableFormat,
  matchesPluginDisableEntry,
  getServerKey,
  getPluginName,
  isPluginServer,
  validatePluginServerName,
} from '../../src/utils/plugin.js';

describe('getPluginKey', () => {
  it('should extract plugin key from standard server name', () => {
    expect(getPluginKey('ide:developer-toolkit@claude-code-plugins'))
      .toBe('developer-toolkit@claude-code-plugins');
  });

  it('should extract plugin key from multi-word plugin name', () => {
    expect(getPluginKey('fetch:mcp-fetch@claude-skills'))
      .toBe('mcp-fetch@claude-skills');
  });

  it('should return null for non-plugin server names', () => {
    expect(getPluginKey('simple-server')).toBeNull();
    expect(getPluginKey('server-without-at')).toBeNull();
  });

  it('should return null for malformed server names', () => {
    expect(getPluginKey('@marketplace')).toBeNull();
    expect(getPluginKey('server@')).toBeNull();
  });
});

describe('getPluginDisableFormat', () => {
  it('should convert standard server name to disable format', () => {
    expect(getPluginDisableFormat('ide:developer-toolkit@claude-code-plugins'))
      .toBe('plugin:developer-toolkit:ide');
  });

  it('should handle server names without colon (root-level)', () => {
    expect(getPluginDisableFormat('stripe@claude-code-plugins'))
      .toBe('plugin:stripe:stripe');
  });

  it('should return original name if no @ symbol', () => {
    expect(getPluginDisableFormat('simple-server'))
      .toBe('simple-server');
  });
});

describe('parsePluginDisableFormat', () => {
  it('should parse standard disable format', () => {
    expect(parsePluginDisableFormat('plugin:developer-toolkit:ide'))
      .toEqual({ pluginName: 'developer-toolkit', serverKey: 'ide' });
  });

  it('should return null for non-plugin format', () => {
    expect(parsePluginDisableFormat('simple-server')).toBeNull();
    expect(parsePluginDisableFormat('other:format:here')).toBeNull();
  });

  it('should return null for malformed plugin format', () => {
    expect(parsePluginDisableFormat('plugin:only-two')).toBeNull();
    expect(parsePluginDisableFormat('plugin:')).toBeNull();
  });
});

describe('matchesPluginDisableEntry', () => {
  it('should match when formats correspond', () => {
    expect(matchesPluginDisableEntry(
      'ide:developer-toolkit@claude-code-plugins',
      'plugin:developer-toolkit:ide'
    )).toBe(true);
  });

  it('should match direct equality', () => {
    expect(matchesPluginDisableEntry('simple-server', 'simple-server')).toBe(true);
  });

  it('should not match different servers', () => {
    expect(matchesPluginDisableEntry(
      'ide:developer-toolkit@claude-code-plugins',
      'plugin:other-toolkit:ide'
    )).toBe(false);
  });

  it('should not match different server keys', () => {
    expect(matchesPluginDisableEntry(
      'ide:developer-toolkit@claude-code-plugins',
      'plugin:developer-toolkit:other'
    )).toBe(false);
  });
});

describe('getServerKey', () => {
  it('should extract server key from full name', () => {
    expect(getServerKey('ide:developer-toolkit@claude-code-plugins')).toBe('ide');
    expect(getServerKey('fetch:mcp-fetch@claude-skills')).toBe('fetch');
  });

  it('should return full name if no colon', () => {
    expect(getServerKey('simple-server')).toBe('simple-server');
  });
});

describe('getPluginName', () => {
  it('should extract plugin name from full server name', () => {
    expect(getPluginName('ide:developer-toolkit@claude-code-plugins'))
      .toBe('developer-toolkit');
  });

  it('should return null for non-plugin servers', () => {
    expect(getPluginName('simple-server')).toBeNull();
    expect(getPluginName('server@marketplace')).toBeNull();
  });
});

describe('isPluginServer', () => {
  it('should return true for plugin server names', () => {
    expect(isPluginServer('ide:developer-toolkit@claude-code-plugins')).toBe(true);
    expect(isPluginServer('fetch:mcp-fetch@claude-skills')).toBe(true);
  });

  it('should return false for non-plugin server names', () => {
    expect(isPluginServer('simple-server')).toBe(false);
    expect(isPluginServer('server@marketplace')).toBe(false);
    expect(isPluginServer('server:name')).toBe(false);
  });
});

describe('validatePluginServerName', () => {
  it('should validate standard plugin server names', () => {
    expect(validatePluginServerName('ide:developer-toolkit@claude-code-plugins'))
      .toEqual({ valid: true });
    expect(validatePluginServerName('fetch:mcp-fetch@claude-skills'))
      .toEqual({ valid: true });
  });

  it('should reject empty strings', () => {
    const result = validatePluginServerName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject names with multiple colons', () => {
    const result = validatePluginServerName('api:server:name@marketplace');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('multiple colons');
  });

  it('should reject names with multiple @ symbols', () => {
    const result = validatePluginServerName('api:user@domain@marketplace');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('multiple @');
  });

  it('should reject scoped npm packages (contain @)', () => {
    // Scoped packages like @company/plugin have @ before the plugin name
    const result = validatePluginServerName('api:@company/plugin@marketplace');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('multiple @');
  });

  it('should reject names with no colon', () => {
    const result = validatePluginServerName('plugin@marketplace');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Expected exactly 1 colon');
  });

  it('should reject names with no @ symbol', () => {
    const result = validatePluginServerName('server:plugin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Expected exactly 1 @');
  });

  it('should reject names where @ comes before colon', () => {
    const result = validatePluginServerName('server@market:plugin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('colon must appear before @');
  });

  it('should reject names with empty components', () => {
    expect(validatePluginServerName(':plugin@marketplace').valid).toBe(false);
    expect(validatePluginServerName('server:@marketplace').valid).toBe(false);
    expect(validatePluginServerName('server:plugin@').valid).toBe(false);
  });
});

describe('edge cases with special characters', () => {
  describe('getPluginKey with edge cases', () => {
    it('should handle empty string', () => {
      expect(getPluginKey('')).toBeNull();
    });

    it('should handle names with only colon', () => {
      expect(getPluginKey(':')).toBeNull();
    });

    it('should handle names with only @', () => {
      expect(getPluginKey('@')).toBeNull();
    });
  });

  describe('getPluginDisableFormat with edge cases', () => {
    it('should handle empty string', () => {
      expect(getPluginDisableFormat('')).toBe('');
    });

    it('should handle minimal valid format', () => {
      expect(getPluginDisableFormat('a:b@c')).toBe('plugin:b:a');
    });
  });

  describe('parsePluginDisableFormat with edge cases', () => {
    it('should handle plugin: prefix with too many parts', () => {
      // Multiple colons in disable format - should return null
      expect(parsePluginDisableFormat('plugin:name:with:extra:colons')).toBeNull();
    });

    it('should handle empty parts', () => {
      // parsePluginDisableFormat allows empty strings (returns { pluginName: '', serverKey: '' })
      // This is technically valid according to the split logic
      const result = parsePluginDisableFormat('plugin::');
      expect(result).toEqual({ pluginName: '', serverKey: '' });
    });
  });
});
