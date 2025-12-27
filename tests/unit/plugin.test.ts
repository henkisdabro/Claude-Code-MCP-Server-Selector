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
