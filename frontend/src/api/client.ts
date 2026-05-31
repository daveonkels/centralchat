const API_BASE = '/api';

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 413) {
    return 'Upload is larger than the server currently allows. Use the imports folder or raise the upload limit.';
  }

  const contentType = res.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data?.detail) return data.detail;
    } else {
      const text = await res.text();
      if (/request entity too large|client intended to send too large body/i.test(text)) {
        return 'Upload is larger than the server currently allows. Use the imports folder or raise the upload limit.';
      }
      if (text.trim()) return `${fallback}: ${text.trim().slice(0, 160)}`;
    }
  } catch {
    // Fall through to the status-based message.
  }

  return `${fallback} (${res.status}${res.statusText ? ` ${res.statusText}` : ''})`;
}

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

export interface PurgeResult {
  platform: string;
  conversations_deleted: number;
  messages_deleted: number;
  media_deleted: number;
  imports_deleted: number;
}

export interface PurgeResponse {
  results: PurgeResult[];
}

export interface DetectedExport {
  path: string;
  name: string;
  platform: string;
}

export interface SkippedExport {
  path: string;
  name: string;
  reason: string;
}

export interface ImportScanResponse {
  detected_exports: DetectedExport[];
  skipped_exports?: SkippedExport[];
  total_folders: number;
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
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Search failed'));
  }
  return res.json();
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to load conversation'));
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
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to list conversations'));
  return res.json();
}

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/conversations/stats`);
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to get stats'));
  return res.json();
}

export async function scanImports(): Promise<ImportScanResponse> {
  const res = await fetch(`${API_BASE}/import/scan`);
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to scan imports'));
  return res.json();
}

export async function runImport(): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/run`, { method: 'POST' });
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Import failed'));
  return res.json();
}

export async function getImportStatus(jobId: string): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/status/${jobId}`);
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to get import status'));
  return res.json();
}

export async function cancelImport(jobId: string): Promise<ImportJobResponse> {
  const res = await fetch(`${API_BASE}/import/cancel/${jobId}`, { method: 'POST' });
  if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to cancel import'));
  return res.json();
}

export async function uploadImport(file: File): Promise<ImportStatus> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`${API_BASE}/import/upload`, { method: 'POST', body });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Upload failed'));
  }
  return res.json();
}

export async function purgePlatforms(platforms: string[]): Promise<PurgeResponse> {
  const res = await fetch(`${API_BASE}/import/purge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platforms }),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to purge data'));
  }
  return res.json();
}
