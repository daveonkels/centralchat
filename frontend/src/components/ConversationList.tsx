import { SearchResult, Conversation } from '../api/client';

interface ConversationListProps {
  results: SearchResult[];
  conversations: Conversation[];
  loading: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  isSearchMode: boolean;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`platform-badge ${platform}`}>
      {platform}
    </span>
  );
}

function ConversationList({
  results,
  conversations,
  loading,
  selectedId,
  onSelect,
  isSearchMode,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="results-list">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  // Search mode: show search results
  if (isSearchMode) {
    if (results.length === 0) {
      return (
        <div className="results-list">
          <div className="empty-state">
            <h3>No results found</h3>
            <p>Try a different search term</p>
          </div>
        </div>
      );
    }

    return (
      <div className="results-list">
        <div className="results-header">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </div>
        {results.map((result, idx) => (
          <div
            key={`${result.conversation_id}-${result.message_id || idx}`}
            className={`result-item ${selectedId === result.conversation_id ? 'selected' : ''}`}
            onClick={() => onSelect(result.conversation_id)}
          >
            <div className="result-title">
              <PlatformBadge platform={result.platform} />
              <span>{result.conversation_title || 'Untitled'}</span>
            </div>
            <div
              className="result-snippet"
              dangerouslySetInnerHTML={{ __html: result.snippet }}
            />
            <div className="result-meta">
              {result.role && <span>{result.role}</span>}
              <span>{formatDate(result.conversation_date)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Browse mode: show conversations
  if (conversations.length === 0) {
    return (
      <div className="results-list">
        <div className="empty-state">
          <h3>No conversations yet</h3>
          <p>Import your chat exports to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-list">
      <div className="results-header">
        {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
      </div>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={`result-item ${selectedId === conv.id ? 'selected' : ''}`}
          onClick={() => onSelect(conv.id)}
        >
          <div className="result-title">
            <PlatformBadge platform={conv.platform} />
            <span>{conv.title || 'Untitled'}</span>
          </div>
          {conv.summary && (
            <div className="result-snippet">{conv.summary}</div>
          )}
          <div className="result-meta">
            {conv.message_count !== undefined && (
              <span>{conv.message_count} messages</span>
            )}
            <span>{formatDate(conv.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default ConversationList;
