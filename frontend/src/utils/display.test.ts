import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, browseMetadataColumns, displayGroup, sanitizeDisplay } from './display';

describe('saved display settings', () => {
  it('keeps explicit hidden fields while rejecting malformed settings', () => {
    expect(sanitizeDisplay({ density: 'comfortable', groupBy: 'source', showDate: false, showContent: false, showCount: 'false', showSource: null })).toEqual({
      ...DEFAULT_DISPLAY, density: 'comfortable', groupBy: 'source', showDate: false, showContent: false,
    });
    expect(sanitizeDisplay({ density: 'unknown', groupBy: 'unknown' })).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay([])).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay(null)).toEqual(DEFAULT_DISPLAY);
  });

  it('removes hidden metadata columns instead of leaving blank tracks', () => {
    expect(browseMetadataColumns(DEFAULT_DISPLAY)).toBe('110px 80px 110px');
    expect(browseMetadataColumns({ ...DEFAULT_DISPLAY, showSource: false, showCount: false })).toBe('110px');
    expect(browseMetadataColumns({ ...DEFAULT_DISPLAY, showSource: false, showCount: false, showDate: false })).toBe('');
  });
});

describe('result group headings', () => {
  it('keeps relevance search ungrouped by date', () => {
    expect(displayGroup('date', 'openai', '2025-01-15T12:00:00', true, 'relevance')).toBeNull();
    expect(displayGroup('source', 'openai', '2025-01-15T12:00:00', true, 'relevance')).toEqual({ key: 'openai', label: 'ChatGPT' });
  });

  it('groups chronological search by its supplied hit date, and supports no grouping', () => {
    const january = displayGroup('date', 'claude', '2025-01-15T12:00:00', true, 'newest');
    const february = displayGroup('date', 'claude', '2025-02-15T12:00:00', true, 'newest');
    expect(january?.key).not.toBe(february?.key);
    expect(displayGroup('none', 'claude', '2025-01-15T12:00:00')).toBeNull();
    expect(displayGroup('date', 'claude', 'invalid')).toEqual({ key: 'undated', label: 'Undated' });
  });
});
