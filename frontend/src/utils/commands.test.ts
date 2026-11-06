import { describe, expect, it } from 'vitest';
import { commandIndex, filterCommands, groupCommands } from './commands';

const actions = [
  { id: 'saved', label: 'Café research', description: 'Claude + images', group: 'Saved views' },
  { id: 'code', label: 'Filter by Code', keywords: 'programming scripts', group: 'Content filters' },
  { id: 'light', label: 'Switch to light theme', keywords: 'appearance color', group: 'Appearance' },
  { id: 'images', label: 'Filter by Images', keywords: 'pictures photos', group: 'Content filters' },
];

describe('command search', () => {
  it('matches aliases and multiple words across a label, description, and group', () => {
    expect(filterCommands(actions, 'programming')).toEqual([actions[1]]);
    expect(filterCommands(actions, 'cafe images')).toEqual([actions[0]]);
    expect(filterCommands(actions, 'content photos')).toEqual([actions[3]]);
    expect(filterCommands(actions, 'code images')).toEqual([]);
  });

  it('ignores case, diacritics, and repeated whitespace', () => {
    expect(filterCommands(actions, '  CAFE   research ')).toEqual([actions[0]]);
    expect(filterCommands(actions, '   ')).toEqual(actions);
  });

  it('prefers label matches to metadata matches while retaining stable ties', () => {
    const items = [
      { id: 'alias', label: 'Change mode', keywords: 'code', group: 'Actions' },
      { id: 'exact', label: 'Code', group: 'Actions' },
      { id: 'prefix', label: 'Code filters', group: 'Actions' },
      { id: 'tie', label: 'Code archive', group: 'Actions' },
    ];
    expect(filterCommands(items, 'code').map(action => action.id)).toEqual(['exact', 'prefix', 'tie', 'alias']);
  });
});

describe('command selection', () => {
  it('groups non-adjacent items without losing their internal order', () => {
    expect(groupCommands(actions).map(group => [group.name, group.actions.map(action => action.id)])).toEqual([
      ['Saved views', ['saved']], ['Content filters', ['code', 'images']], ['Appearance', ['light']],
    ]);
  });

  it('retains the active command after list changes and safely falls back on deletion', () => {
    expect(commandIndex(actions, 'images')).toBe(3);
    expect(commandIndex([actions[3], ...actions.slice(0, 3)], 'images')).toBe(0);
    expect(commandIndex(actions.slice(0, 3), 'images')).toBe(0);
    expect(commandIndex([], 'images')).toBe(-1);
  });
});
