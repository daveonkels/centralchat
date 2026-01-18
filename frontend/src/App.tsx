import { useState, useEffect, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import Filters from './components/Filters';
import ConversationList from './components/ConversationList';
import MessageViewer from './components/MessageViewer';
import ImportPanel from './components/ImportPanel';
import {
  search,
  getConversation,
  listConversations,
  getStats,
  SearchResult,
  Conversation,
  Stats,
} from './api/client';

function formatLastImported(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Load stats on mount
  useEffect(() => {
    getStats().then(setStats).catch(console.error);
  }, []);

  // Load conversations when no search query
  useEffect(() => {
    if (!query) {
      setLoading(true);
      listConversations({ platform: platform || undefined, limit: 100 })
        .then(setConversations)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [platform, query]);

  // Search with debounce
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await search(q, { platform: platform || undefined, limit: 100 });
      setResults(response.results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  // Load full conversation when selected
  const handleSelectConversation = async (conversationId: string) => {
    try {
      const conv = await getConversation(conversationId);
      setSelectedConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Refresh after import
  const handleImportComplete = () => {
    getStats().then(setStats).catch(console.error);
    if (!query) {
      listConversations({ platform: platform || undefined, limit: 100 })
        .then(setConversations)
        .catch(console.error);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Central Chat Archive</h1>
        <div className="stats">
          {stats && (
            <>
              {stats.last_imported && (
                <span className="last-imported">
                  Imported {formatLastImported(stats.last_imported)}
                </span>
              )}
              <span>{stats.total_conversations.toLocaleString()} conversations</span>
              <span>{stats.total_messages.toLocaleString()} messages</span>
              <button
                className="filter-btn"
                onClick={() => setShowImport(!showImport)}
              >
                {showImport ? 'Hide Import' : 'Import'}
              </button>
            </>
          )}
        </div>
      </header>

      {showImport && (
        <ImportPanel onImportComplete={handleImportComplete} />
      )}

      <SearchBar onSearch={handleSearch} loading={loading && !!query} />

      <Filters
        stats={stats}
        selectedPlatform={platform}
        onPlatformChange={setPlatform}
      />

      <div className="main-content">
        <ConversationList
          results={query ? results : []}
          conversations={query ? [] : conversations}
          loading={loading}
          selectedId={selectedConversation?.id}
          onSelect={handleSelectConversation}
          isSearchMode={!!query}
        />

        <MessageViewer conversation={selectedConversation} />
      </div>
    </div>
  );
}

export default App;
