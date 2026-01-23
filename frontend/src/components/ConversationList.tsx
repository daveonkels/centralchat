import { useRef, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SearchResult, Conversation } from '../api/client';

interface ConversationListProps {
  results: SearchResult[];
  conversations: Conversation[];
  loading: boolean;
  selectedId?: string;
  selectedIndex?: number | null;
  onSelect: (id: string, index: number) => void;
  isSearchMode: boolean;
  suggestions?: string[];
  onSuggestionSelect?: (value: string) => void;
}

const HIGHLIGHT_START = '__CC_HL_START__';
const HIGHLIGHT_END = '__CC_HL_END__';

// Clean up OpenAI citation markers from text/HTML
function cleanContent(text: string): string {
  // OpenAI uses Private Use Area Unicode: \ue200 (open), \ue201 (close), \ue202 (†)
  return text
    .replace(/\ue200[^\ue201]*\ue201/g, '')  // Private Use Area markers
    .replace(/【[^】]*】/g, '')                // CJK bracket markers (fallback)
    .replace(/  +/g, ' ');
}

function renderSnippet(snippet: string) {
  const cleaned = cleanContent(snippet);
  if (!cleaned) return null;

  const nodes: JSX.Element[] = [];
  let remaining = cleaned;
  let key = 0;

  while (remaining.length > 0) {
    const startIndex = remaining.indexOf(HIGHLIGHT_START);
    if (startIndex === -1) {
      nodes.push(<span key={`t-${key++}`}>{remaining}</span>);
      break;
    }

    if (startIndex > 0) {
      nodes.push(<span key={`t-${key++}`}>{remaining.slice(0, startIndex)}</span>);
    }

    const afterStart = remaining.slice(startIndex + HIGHLIGHT_START.length);
    const endIndex = afterStart.indexOf(HIGHLIGHT_END);
    if (endIndex === -1) {
      nodes.push(<span key={`t-${key++}`}>{afterStart}</span>);
      break;
    }

    nodes.push(<mark key={`m-${key++}`}>{afterStart.slice(0, endIndex)}</mark>);
    remaining = afterStart.slice(endIndex + HIGHLIGHT_END.length);
  }

  return nodes;
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

// Display names for platforms (backend uses internal names)
function getPlatformDisplayName(platform: string): string {
  const displayNames: Record<string, string> = {
    openai: 'ChatGPT',
    claude: 'Claude',
    raycast: 'Raycast',
  };
  return displayNames[platform] || platform;
}

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`platform-badge ${platform}`}>
      {getPlatformDisplayName(platform)}
    </span>
  );
}

// Loading skeleton component
function LoadingSkeleton() {
  return (
    <>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="result-skeleton">
          <div className="skeleton result-skeleton-badge" />
          <div className="skeleton result-skeleton-title" />
          <div className="skeleton result-skeleton-snippet" />
          <div className="skeleton result-skeleton-snippet" style={{ width: '60%' }} />
          <div className="skeleton result-skeleton-meta" />
        </div>
      ))}
    </>
  );
}

// Empty state icons
const SearchEmptyIcon = () => (
  <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const ConversationEmptyIcon = () => (
  <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
  </svg>
);

function ConversationList({
  results,
  conversations,
  loading,
  selectedId,
  selectedIndex,
  onSelect,
  isSearchMode,
  suggestions = [],
  onSuggestionSelect,
}: ConversationListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [animatedItems, setAnimatedItems] = useState<Set<string>>(new Set());

  // Determine items to render
  const items = isSearchMode ? results : conversations;

  // Get unique key for item
  const getItemKey = useCallback((item: SearchResult | Conversation, index: number) => {
    if ('message_id' in item) {
      return `${item.conversation_id}-${item.message_id || index}`;
    }
    return item.id;
  }, []);

  // Reset animations when items change
  useEffect(() => {
    setAnimatedItems(new Set());
  }, [isSearchMode, items.length]);

  // Virtualizer setup
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      // Search results with snippets are taller
      if (isSearchMode && results[index]?.snippet) {
        return 110;
      }
      return 88;
    }, [isSearchMode, results]),
    overscan: 5,
  });

  useEffect(() => {
    if (
      selectedIndex === null ||
      selectedIndex === undefined ||
      selectedIndex < 0 ||
      selectedIndex >= items.length
    ) {
      return;
    }

    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, items.length, virtualizer]);

  // Mark item as animated
  const markAnimated = useCallback((key: string) => {
    setAnimatedItems(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="results-list">
        <div className="results-header">
          <div className="loading-spinner" />
          <span>Loading...</span>
        </div>
        <div className="results-scroll">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  // Search mode: show search results
  if (isSearchMode) {
    if (results.length === 0) {
      return (
        <div className="results-list">
          <div className="results-header">Search results</div>
          <div className="empty-state">
            <SearchEmptyIcon />
            <h3>No results found</h3>
            <p>Try different keywords or remove filters</p>
            {suggestions.length > 0 && (
              <div className="search-suggestions">
                <div className="search-suggestions-label">Suggested queries</div>
                <div className="search-suggestions-list">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      className="search-suggestion-chip"
                      onClick={() => onSuggestionSelect?.(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="results-list">
        <div className="results-header">
          <strong>{results.length}</strong> result{results.length !== 1 ? 's' : ''}
        </div>
        <div ref={parentRef} className="results-scroll">
          <div
            className="results-virtual"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const result = results[virtualRow.index];
              const key = getItemKey(result, virtualRow.index);
              const isAnimated = animatedItems.has(key);
              const shouldAnimate = !isAnimated && virtualRow.index < 20;
              const isSelected = selectedIndex !== null && selectedIndex !== undefined
                ? selectedIndex === virtualRow.index
                : selectedId === result.conversation_id;

              if (shouldAnimate) {
                // Schedule animation mark after render
                requestAnimationFrame(() => markAnimated(key));
              }

              return (
                <div
                  key={key}
                  className={`result-item ${isSelected ? `selected ${result.platform}` : ''} ${shouldAnimate ? 'animate-in' : ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    animationDelay: shouldAnimate ? `${virtualRow.index * 30}ms` : undefined,
                  }}
                  onClick={() => onSelect(result.conversation_id, virtualRow.index)}
                >
                  <div className="result-title">
                    <PlatformBadge platform={result.platform} />
                    <span>{result.conversation_title || 'Untitled'}</span>
                  </div>
                  <div className="result-snippet">
                    {renderSnippet(result.snippet)}
                  </div>
                  <div className="result-meta">
                    {result.role && <span>{result.role}</span>}
                    <span>{formatDate(result.conversation_date)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Browse mode: show conversations
  if (conversations.length === 0) {
    return (
      <div className="results-list">
        <div className="results-header">Conversations</div>
        <div className="empty-state">
          <ConversationEmptyIcon />
          <h3>No conversations yet</h3>
          <p>Import your chat exports to get started</p>
          <div className="empty-steps">
            <div className="empty-steps-title">Get started</div>
            <ol>
              <li>Export chats from ChatGPT, Claude, or Raycast.</li>
              <li>Drop export folders into <code>imports/</code>.</li>
              <li>Click Import to index and search.</li>
            </ol>
            <div className="empty-steps-files">
              Expected files: <code>conversations.json</code>, <code>raycast_ai_chats.json</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="results-list">
      <div className="results-header">
        <strong>{conversations.length}</strong> conversation{conversations.length !== 1 ? 's' : ''}
      </div>
      <div ref={parentRef} className="results-scroll">
        <div
          className="results-virtual"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const conv = conversations[virtualRow.index];
            const key = getItemKey(conv, virtualRow.index);
            const isAnimated = animatedItems.has(key);
            const shouldAnimate = !isAnimated && virtualRow.index < 20;
            const isSelected = selectedIndex !== null && selectedIndex !== undefined
              ? selectedIndex === virtualRow.index
              : selectedId === conv.id;

            if (shouldAnimate) {
              requestAnimationFrame(() => markAnimated(key));
            }

            return (
              <div
                key={conv.id}
                className={`result-item ${isSelected ? `selected ${conv.platform}` : ''} ${shouldAnimate ? 'animate-in' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  animationDelay: shouldAnimate ? `${virtualRow.index * 30}ms` : undefined,
                }}
                onClick={() => onSelect(conv.id, virtualRow.index)}
              >
                <div className="result-title">
                  <PlatformBadge platform={conv.platform} />
                  <span>{conv.title || 'Untitled'}</span>
                </div>
                {conv.summary && (
                  <div className="result-snippet">{cleanContent(conv.summary)}</div>
                )}
                <div className="result-meta">
                  {conv.message_count !== undefined && (
                    <span>{conv.message_count} messages</span>
                  )}
                  <span>{formatDate(conv.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ConversationList;
