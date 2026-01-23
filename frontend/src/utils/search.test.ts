import { describe, it, expect } from 'vitest';
import { buildSearchSuggestions, parseSearchInput, normalizeRole } from './search';

describe('parseSearchInput', () => {
  it('parses plain text', () => {
    const result = parseSearchInput('hello world');
    expect(result).toEqual({ text: 'hello world' });
  });

  it('parses platform and role filters', () => {
    const result = parseSearchInput('platform:openai role:user hello');
    expect(result).toEqual({
      text: 'hello',
      platform: 'openai',
      role: 'user',
    });
  });

  it('parses from and before filters', () => {
    const result = parseSearchInput('from:assistant before:2024-01-01 foo');
    expect(result).toEqual({
      text: 'foo',
      role: 'assistant',
      before: '2024-01-01',
    });
  });

  it('keeps unknown tokens in text', () => {
    const result = parseSearchInput('hello tag:green');
    expect(result).toEqual({ text: 'hello tag:green' });
  });
});

describe('normalizeRole', () => {
  it('normalizes aliases', () => {
    expect(normalizeRole('me')).toBe('user');
    expect(normalizeRole('AI')).toBe('assistant');
    expect(normalizeRole('system')).toBe('system');
  });
});

describe('buildSearchSuggestions', () => {
  it('suggests platform and role filters', () => {
    const suggestions = buildSearchSuggestions('hello');
    expect(suggestions).toContain('platform:openai hello');
    expect(suggestions).toContain('role:user hello');
  });

  it('does not suggest platform when already present', () => {
    const suggestions = buildSearchSuggestions('platform:openai hello');
    expect(suggestions.some((item) => item.startsWith('platform:'))).toBe(false);
    expect(suggestions).toContain('role:user hello');
  });

  it('suggests before operator on empty input', () => {
    const suggestions = buildSearchSuggestions('');
    expect(suggestions).toContain('before:2024-01-01');
  });
});
