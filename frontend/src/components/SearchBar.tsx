import { useEffect, useRef, useCallback } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  loading?: boolean;
  recentSearches?: string[];
  onSelectRecent?: (query: string) => void;
  error?: string | null;
  onToggleHelp?: () => void;
}

// Search icon SVG
const SearchIcon = () => (
  <svg
    className="search-icon"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
      clipRule="evenodd"
    />
  </svg>
);

// X icon for clear button
const XIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M11 3L3 11M3 3l8 8" />
  </svg>
);

function SearchBar({
  value,
  onChange,
  loading = false,
  recentSearches = [],
  onSelectRecent,
  error,
  onToggleHelp,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Cmd+K or Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = tagName === 'input' || tagName === 'textarea' || target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === '/' && !isEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      // Escape to clear and blur
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        if (value) {
          onChange('');
        } else {
          inputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, onChange]);

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="search-container">
      <div className="search-wrapper">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search across all your chats..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        <div className="search-actions">
          {loading && <div className="search-loading" aria-label="Searching..." />}
          {value ? (
            <button
              className="search-clear"
              onClick={handleClear}
              aria-label="Clear search"
              type="button"
            >
              <XIcon />
            </button>
          ) : (
            <div className="search-shortcut">
              <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
              <kbd>K</kbd>
            </div>
          )}
          {onToggleHelp && (
            <button
              className="search-help-btn"
              onClick={onToggleHelp}
              type="button"
              aria-label="Show search help"
              title="Show search help (?)"
            >
              ?
            </button>
          )}
        </div>
      </div>

      <div className="search-extras">
        <div className="search-help">
          <span className="search-help-label">Operators:</span>
          <code>platform:openai</code>
          <code>role:user</code>
          <code>from:assistant</code>
          <code>before:2024-01-01</code>
        </div>

        {recentSearches.length > 0 && (
          <div className="search-recents">
            <span className="search-recents-label">Recent</span>
            <div className="search-recents-list">
              {recentSearches.map((query) => (
                <button
                  key={query}
                  className="search-recent-chip"
                  onClick={() => onSelectRecent?.(query)}
                  type="button"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="search-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
