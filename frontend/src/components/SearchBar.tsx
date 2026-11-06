import { useEffect, useRef, useState } from 'react';
import { FiSearch as MdSearch, FiX as MdClose, FiCommand } from 'react-icons/fi';
import './commandPalette.css';
interface Props {
  value: string; onChange: (query: string) => void; loading?: boolean;
  recentSearches?: string[]; onSelectRecent?: (query: string) => void;
  onToggleHelp?: () => void; onCommit?: () => void;
  onCommands?: () => void;
}
export default function SearchBar({ value, onChange, loading, recentSearches = [], onSelectRecent, onToggleHelp, onCommit, onCommands }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement;
      if (event.key === '/' && !target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
        event.preventDefault(); input.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return <div className="search-container" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setFocused(false); onCommit?.(); } }}>
    <div className="search-wrapper"><MdSearch aria-hidden="true" />
      <input id="archive-search" ref={input} aria-label="Search archive" type="search" placeholder="Search conversations…" value={value} onFocus={() => setFocused(true)} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { onChange(''); setFocused(false); } if (e.key === 'Enter') { onCommit?.(); setFocused(false); } }} autoComplete="off" spellCheck={false} />
      {loading && <span className="loading-spinner" aria-label="Searching" />}
      {value ? <button className="icon-button" aria-label="Clear search" onClick={() => { onChange(''); input.current?.focus(); }}><MdClose /></button> : !onCommands && <kbd className="search-shortcut">/</kbd>}
      {onCommands && <button type="button" className="command-trigger" aria-label="Open command palette" title="Commands (⌘K / Ctrl+K)" aria-keyshortcuts="Meta+k Control+k" onClick={onCommands}><FiCommand aria-hidden="true" /><kbd aria-hidden="true">K</kbd></button>}
      <button className="icon-button search-help" aria-label="Search help" onClick={onToggleHelp}>?</button>
    </div>
    {focused && !value && recentSearches.length > 0 && <div className="recent-searches"><span>Recent searches</span>{recentSearches.map(query => <button key={query} onClick={() => { onSelectRecent?.(query); setFocused(false); input.current?.focus(); }}><MdSearch aria-hidden="true" />{query}</button>)}</div>}
  </div>;
}
