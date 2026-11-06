export interface SearchableCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  group: string;
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Match every word across a command's visible label and search aliases. */
export function filterCommands<T extends SearchableCommand>(actions: T[], query: string): T[] {
  const normalized = normalize(query);
  if (!normalized) return actions;
  const words = normalized.split(/\s+/);
  return actions.map((action, index) => {
    const label = normalize(action.label);
    const searchable = normalize([action.label, action.description, action.keywords, action.group].filter(Boolean).join(' '));
    const matches = words.every(word => searchable.includes(word));
    const rank = label === normalized ? 4 : label.startsWith(normalized) ? 3 : words.every(word => label.includes(word)) ? 2 : 1;
    return { action, index, matches, rank };
  }).filter(item => item.matches).sort((a, b) => b.rank - a.rank || a.index - b.index).map(item => item.action);
}

/** Preserve group appearance order and order within each group. */
export function groupCommands<T extends SearchableCommand>(actions: T[]): { name: string; actions: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const action of actions) {
    const existing = groups.get(action.group);
    if (existing) existing.push(action);
    else groups.set(action.group, [action]);
  }
  return Array.from(groups, ([name, items]) => ({ name, actions: items }));
}

/** Keep the active action stable as saved views load or get renamed/deleted. */
export function commandIndex(actions: SearchableCommand[], activeId: string | null): number {
  if (!actions.length) return -1;
  const index = actions.findIndex(action => action.id === activeId);
  return index === -1 ? 0 : index;
}
