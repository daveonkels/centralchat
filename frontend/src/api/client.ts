const API_BASE = '/api';

export interface SearchResult {
  conversation_id: string;
  message_id: string | null;
  entry_type: string;
  snippet: string;
  conversation_title: string | null;
  platform: string;
  conversation_date: string;
  role: string | null;
  content: string | null;
  message_date: string | null;
  rank: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  sequence: number | null;
  media: MediaRef[];
}

export interface MediaRef {
  id: number;
  media_type: string;
  original_path: string;
  filename: string | null;
}

export interface Conversation {
  id: string;
  platform: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string | null;
  model: string | null;
  is_archived: boolean;
  message_count?: number;
  messages?: Message[];
}

export interface Stats {
  total_conversations: number;
  total_messages: number;
  by_platform: Record<string, number>;
  imports: ImportRecord[];
  last_imported: string | null;
}

export interface ImportRecord {
  id: number;
  platform: string;
  import_date: string;
  source_path: string;
  conversation_count: number;
  message_count: number;
}

export interface ImportStatus {
  platform: string;
  source_path: string;
  status: string;
  conversations_found: number;
  conversations_imported: number;
  messages_imported: number;
  errors: string[];
}

export interface ImportJobResponse {
  job_id: string;
  statuses: ImportStatus[];
  completed: boolean;
  canceled: boolean;
}

export interface DetectedExport {
  path: string;
  name: string;
  platform: string;
}

export async function search(
  query: string,
  options: { platform?: string; role?: string; before?: string; limit?: number; offset?: number } = {}
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options.platform) params.set('platform', options.platform);
  if (options.role) params.set('role', options.role);
  if (options.before) params.set('before', options.before);
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());

  const res = await fetch(`${API_BASE}/search?${params}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to load conversation');
  return res.json();
}

export async function listConversations(
  options: { platform?: string; limit?: number; offset?: number } = {}
): Promise<Conversation[]> {
  const params = new URLSearchParams();
  if (options.platform) params.set('platform', options.platform);
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());

  const res = await fetch(`${API_BASE}/conversations?${params}`);
  if (!res.ok) throw new Error('Failed to list conversations');
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/conversations/stats`);
  if (!res.ok) throw new Error('Failed to get stats');
  return res.json();
}

export async function scanImports(): Promise<{ detected_exports: DetectedExport[]; total_folders: number }> {
  const res = await fetch(`${API_BASE}/import/scan`);
  if (!res.ok) throw new Error('Failed to scan imports');
  return res.json();
}

export async function runImport(): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/run`, { method: 'POST' });
  if (!res.ok) throw new Error('Import failed');
  return res.json();
}

export async function getImportStatus(jobId: string): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/status/${jobId}`);
  if (!res.ok) throw new Error('Failed to get import status');
  return res.json();
}

export async function cancelImport(jobId: string): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/cancel/${jobId}`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel import');
  return res.json();
}
