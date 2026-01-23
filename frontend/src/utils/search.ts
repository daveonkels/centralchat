export function normalizeRole(value: string): string {
  const normalized = value.toLowerCase();
  if (['me', 'user'].includes(normalized)) return 'user';
  if (['assistant', 'bot', 'ai'].includes(normalized)) return 'assistant';
  if (['system', 'tool'].includes(normalized)) return normalized;
  return value;
}

export function parseSearchInput(input: string): {
  text: string;
  platform?: string;
  role?: string;
  before?: string;
} {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const textParts: string[] = [];
  let platform: string | undefined;
  let role: string | undefined;
  let before: string | undefined;

  for (const token of tokens) {
    const match = token.match(/^(\w+):(.*)$/);
    if (!match || match[2] === '') {
      textParts.push(token);
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2];

    if (key === 'platform') {
      platform = value.toLowerCase();
      continue;
    }
    if (key === 'role' || key === 'from') {
      role = normalizeRole(value);
      continue;
    }
    if (key === 'before') {
      before = value;
      continue;
    }

    textParts.push(token);
  }

  return {
    text: textParts.join(' ').trim(),
    platform,
    role,
    before,
  };
}

export function buildSearchSuggestions(input: string): string[] {
  const { text, platform, role } = parseSearchInput(input);
  const base = text.trim();
  const suggestions: string[] = [];

  const addSuggestion = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!suggestions.includes(trimmed)) suggestions.push(trimmed);
  };

  if (base && base !== input.trim()) {
    addSuggestion(base);
  }

  if (!base) {
    addSuggestion('before:2024-01-01');
  }

  if (!platform) {
    ['openai', 'claude', 'raycast'].forEach((p) => {
      addSuggestion(`platform:${p} ${base}`.trim());
    });
  }

  if (!role) {
    ['user', 'assistant'].forEach((r) => {
      addSuggestion(`role:${r} ${base}`.trim());
    });
  }

  return suggestions.slice(0, 5);
}
