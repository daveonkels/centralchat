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
import { parseSearchInput, buildSearchSuggestions } from './utils/search';

const MATCH_ALL_QUERY = '__cc_match_all__';
const RECENT_STORAGE_KEY = 'central-chat.recent-searches';
const MAX_RECENT = 6;

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
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // Load stats on mount
  useEffect(() => {
    getStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.filter((item) => typeof item === 'string'));
        }
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  useEffect(() => {
    if (!showHelp) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showHelp]);

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

  const updateRecentSearches = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setRecentSearches((prev) => {
      const next = [
        trimmed,
        ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
      ];
      const limited = next.slice(0, MAX_RECENT);
      try {
        localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(limited));
      } catch {
        // Ignore storage failures
      }
      return limited;
    });
  }, []);

  // Search with debounce
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const { text, platform: inlinePlatform, role, before } = parseSearchInput(q);
      const response = await search(text || MATCH_ALL_QUERY, {
        platform: inlinePlatform || platform || undefined,
        role: role || undefined,
        before: before || undefined,
        limit: 100,
      });
      setResults(response.results);
      updateRecentSearches(q);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [platform, updateRecentSearches]);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, handleSearch]);

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

  const handleSelectRecent = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const handleSelectSuggestion = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showHelp && e.key === 'Escape') {
        e.preventDefault();
        setShowHelp(false);
        return;
      }

      if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !isEditableTarget(e.target)) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      if (showHelp) return;
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
  }, [items, isSearchMode, selectedIndex, handleSelectConversation, showHelp]);

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

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div
            className="help-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts and search operators"
          >
            <div className="help-header">
              <div>
                <h2>Search Help</h2>
                <p>Operators and keyboard shortcuts</p>
              </div>
              <button
                className="help-close"
                onClick={() => setShowHelp(false)}
                type="button"
                aria-label="Close help"
              >
                Esc
              </button>
            </div>

            <div className="help-section">
              <h3>Search Operators</h3>
              <div className="help-list">
                <div className="help-item">
                  <code>platform:openai</code>
                  <span>Filter by platform (openai, claude, raycast)</span>
                </div>
                <div className="help-item">
                  <code>role:user</code>
                  <span>Filter by message role (user, assistant, system)</span>
                </div>
                <div className="help-item">
                  <code>from:assistant</code>
                  <span>Alias for role filter</span>
                </div>
                <div className="help-item">
                  <code>before:2024-01-01</code>
                  <span>Only show results before a date</span>
                </div>
              </div>
            </div>

            <div className="help-section">
              <h3>Keyboard Shortcuts</h3>
              <div className="help-list">
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>{isMac ? 'Cmd' : 'Ctrl'}</kbd>
                    <kbd>K</kbd>
                  </div>
                  <span>Focus search</span>
                </div>
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>/</kbd>
                  </div>
                  <span>Focus search</span>
                </div>
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>?</kbd>
                  </div>
                  <span>Open this help</span>
                </div>
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>Esc</kbd>
                  </div>
                  <span>Clear selection, clear search, or close help</span>
                </div>
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>↑</kbd>
                    <kbd>↓</kbd>
                  </div>
                  <span>Navigate results</span>
                </div>
                <div className="help-item">
                  <div className="help-keys">
                    <kbd>Enter</kbd>
                  </div>
                  <span>Open selected result</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SearchBar
        value={searchInput}
        onChange={setSearchInput}
        loading={loading && !!query}
        recentSearches={recentSearches}
        onSelectRecent={handleSelectRecent}
      />

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
          suggestions={buildSearchSuggestions(query)}
          onSuggestionSelect={handleSelectSuggestion}
        />

        <MessageViewer conversation={selectedConversation} />
      </div>
    </div>
  );
}

export default App;
