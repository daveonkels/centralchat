import { ContentAttribute } from './client';
import { DisplaySettings } from '../utils/display';

export interface ViewConfig {
  query: string;
  platform: 'openai' | 'claude' | 'raycast' | null;
  role: '' | 'user' | 'assistant' | 'system' | 'tool';
  before: string;
  attribute: ContentAttribute | '';
  sort: 'relevance' | 'newest' | 'oldest';
  display: DisplaySettings;
}
export interface SavedView { id: string; name: string; config: ViewConfig; created_at: string; updated_at: string }

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/views${path}`, options);
  if (!response.ok) {
    let message = !options?.method ? 'Could not load saved views. Try again.' : 'Could not save changes to your views. Try again.';
    try {
      const data = await response.json();
      if (typeof data.detail === 'string') message = data.detail;
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) message = `${data.detail[0].loc?.slice(1).join(' → ') || 'View'}: ${data.detail[0].msg}`;
    } catch { /* Use fallback. */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const listViews = () => request<SavedView[]>();
export const createView = (name: string, config: ViewConfig) => request<SavedView>('', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, config }),
});
export const updateView = (id: string, patch: { name?: string; config?: ViewConfig }) => request<SavedView>(`/${encodeURIComponent(id)}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
});
export const deleteView = (id: string) => request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
