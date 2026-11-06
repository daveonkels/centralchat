import { platformName } from './presentation';

export interface DisplaySettings {
  density: 'compact' | 'comfortable';
  groupBy: 'date' | 'source' | 'none';
  showSource: boolean;
  showDate: boolean;
  showCount: boolean;
  showContent: boolean;
  showPreview: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  density: 'compact', groupBy: 'date', showSource: true, showDate: true,
  showCount: true, showContent: true, showPreview: true,
};

export function sanitizeDisplay(value: unknown): DisplaySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_DISPLAY };
  const input = value as Record<string, unknown>;
  const output = { ...DEFAULT_DISPLAY };
  if (input.density === 'compact' || input.density === 'comfortable') output.density = input.density;
  if (input.groupBy === 'date' || input.groupBy === 'source' || input.groupBy === 'none') output.groupBy = input.groupBy;
  for (const key of ['showSource', 'showDate', 'showCount', 'showContent', 'showPreview'] as const) {
    if (typeof input[key] === 'boolean') output[key] = input[key];
  }
  return output;
}

export function browseMetadataColumns(settings: DisplaySettings): string {
  return [settings.showSource && '110px', settings.showCount && '80px', settings.showDate && '110px'].filter(Boolean).join(' ');
}

/** Headers follow the server's ordering; never reorder result indices locally. */
export function displayGroup(groupBy: DisplaySettings['groupBy'], platform: string, dateValue: string | null,
  isSearchMode = false, sort = 'relevance'): { key: string; label: string } | null {
  if (groupBy === 'none' || (isSearchMode && groupBy === 'date' && sort === 'relevance')) return null;
  if (groupBy === 'source') return { key: platform, label: platformName(platform) };
  const date = dateValue ? new Date(dateValue) : new Date(NaN);
  if (Number.isNaN(date.getTime())) return { key: 'undated', label: 'Undated' };
  return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}
