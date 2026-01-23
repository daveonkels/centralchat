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

// Parse conversation ID from URL path like /c/{id}
function getConversationIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/c\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Load stats on mount
  useEffect(() => {
    getStats().then(setStats).catch(console.error);
  }, []);

  // Load conversation from URL on mount
  useEffect(() => {
    const conversationId = getConversationIdFromUrl();
    if (conversationId) {
      getConversation(conversationId)
        .then(setSelectedConversation)
        .catch(console.error);
    }
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const conversationId = getConversationIdFromUrl();
      if (conversationId) {
        getConversation(conversationId)
          .then(setSelectedConversation)
          .catch(console.error);
      } else {
        setSelectedConversation(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  useEffect(() => {
    setSelectedIndex(null);
  }, [query, platform]);

  const isSearchMode = !!query;
  const items = isSearchMode ? results : conversations;

  useEffect(() => {
    if (items.length === 0) {
      if (selectedIndex !== null) setSelectedIndex(null);
      return;
    }

    if (selectedIndex !== null && selectedIndex >= items.length) {
      setSelectedIndex(items.length - 1);
    }
  }, [items.length, selectedIndex]);

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
  const handleSelectConversation = useCallback(async (conversationId: string) => {
    try {
      const conv = await getConversation(conversationId);
      setSelectedConversation(conv);
      // Update URL without triggering navigation
      const newUrl = `/c/${encodeURIComponent(conversationId)}`;
      window.history.pushState({ conversationId }, '', newUrl);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  const handleSelectFromList = useCallback((conversationId: string, index: number) => {
    setSelectedIndex(index);
    handleSelectConversation(conversationId);
  }, [handleSelectConversation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (items.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === null) {
            return e.key === 'ArrowDown' ? 0 : items.length - 1;
          }
          const delta = e.key === 'ArrowDown' ? 1 : -1;
          const next = Math.min(Math.max(prev + delta, 0), items.length - 1);
          return next;
        });
        return;
      }

      if (e.key === 'Enter') {
        if (selectedIndex === null) return;
        const item = items[selectedIndex];
        if (!item) return;
        const conversationId = isSearchMode
          ? (item as SearchResult).conversation_id
          : (item as Conversation).id;
        if (conversationId) {
          handleSelectConversation(conversationId);
        }
        return;
      }

      if (e.key === 'Escape') {
        setSelectedIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, isSearchMode, selectedIndex, handleSelectConversation]);

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
          selectedIndex={selectedIndex}
          onSelect={handleSelectFromList}
          isSearchMode={isSearchMode}
        />

        <MessageViewer conversation={selectedConversation} />
      </div>
    </div>
  );
}

export default App;
