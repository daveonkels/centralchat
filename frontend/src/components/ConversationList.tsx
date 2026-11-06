import { CSSProperties, Fragment, useEffect, useRef } from 'react';
import { FiMessageSquare, FiArrowRight, FiSearch, FiInbox } from 'react-icons/fi';
import { SearchResult, Conversation, ContentAttribute } from '../api/client';
import { PlatformIcon } from './PlatformIcons';
import { snippetParts, platformName, formatDate } from '../utils/presentation';
import ContentBadges from './ContentBadges';
import { DEFAULT_DISPLAY, DisplaySettings, browseMetadataColumns, displayGroup } from '../utils/display';
import './display.css';

interface Props {
  display?: DisplaySettings; sort?: string;
  results: SearchResult[]; conversations: Conversation[]; loading: boolean;
  hasFilters: boolean; onFilterAttribute: (value: ContentAttribute) => void;
  selectedId?: string; selectedIndex?: number | null;
  onSelect: (id: string, index: number, message: string | null) => void;
  isSearchMode: boolean; error: string | null; hasMore: boolean; loadingMore: boolean;
  onLoadMore: () => void; onRetry: () => void; onReset: () => void; onImport: () => void;
}
function Snippet({ value }: { value: string }) {
  const plain = value.replace(/\|?\s*:?-{3,}:?\s*(?=\||$)/g, '').replace(/\|/g, ' · ').replace(/[`*#]/g, '');
  return <span className="result-snippet">{snippetParts(plain).map((part, n) => part.highlight ? <mark key={n}>{part.text}</mark> : part.text)}</span>;
}
function Source({ platform }: { platform: string }) {
  return <span className={`source-badge ${platform}`}><PlatformIcon platform={platform} size={13} /><span>{platformName(platform)}</span></span>;
}
export default function ConversationList(props: Props) {
  const { results, conversations, loading, selectedIndex, onSelect, isSearchMode, error, hasMore, loadingMore } = props;
  const display = props.display || DEFAULT_DISPLAY;
  const sort = props.sort || 'relevance';
  const scroll = useRef<HTMLDivElement>(null);
  const items = isSearchMode ? results : conversations;
  const grouped = new Map<string, { hit: SearchResult; index: number }[]>();
  results.forEach((hit, index) => {
    const matches = grouped.get(hit.conversation_id);
    if (matches) matches.push({ hit, index }); else grouped.set(hit.conversation_id, [{ hit, index }]);
  });
  const groups = Array.from(grouped.entries());
  const headingForHit = (hit: SearchResult) => displayGroup(display.groupBy, hit.platform, hit.message_date || hit.conversation_date, true, sort);
  const columns = { '--display-metadata-columns': browseMetadataColumns(display) } as CSSProperties;
  useEffect(() => { if (loading && scroll.current) scroll.current.scrollTop = 0; }, [loading]);
  return <div className="results-scroll display-results" style={columns} ref={scroll} aria-busy={loading || loadingMore} onKeyDown={event => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const buttons = Array.from(scroll.current?.querySelectorAll<HTMLButtonElement>('[data-result-index]') || []).filter(button => button.getClientRects().length > 0);
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  }}>
    {error && <div className="error-state" role="alert"><h3>Couldn’t load the archive</h3><p>{error}</p><button onClick={props.onRetry}>Try again</button></div>}
    {loading ? <div className="list-skeleton" aria-label="Loading conversations">{Array.from({length: 8}, (_, i) => <div className="skeleton-row" key={i}><span /><span /></div>)}</div> : !error && items.length === 0 ?
      <div className="empty-state"><div className="empty-symbol">{isSearchMode ? <FiSearch /> : <FiInbox />}</div><h3>{(isSearchMode || props.hasFilters) ? 'No conversations found' : 'A home for your conversations'}</h3><p>{(isSearchMode || props.hasFilters) ? 'Try different words or broaden your filters.' : 'Bring your ChatGPT, Claude, and Raycast exports into one searchable archive.'}</p><button className="primary-button" onClick={isSearchMode || props.hasFilters ? props.onReset : props.onImport}>{isSearchMode || props.hasFilters ? 'Clear search & filters' : 'Import conversations'}</button></div> : !loading && <>
      {!isSearchMode && <div className="list-columns" aria-hidden="true"><span>Conversation</span>{display.showSource && <span className="column-source">Source</span>}{display.showCount && <span className="column-count">Messages</span>}{display.showDate && <span className="column-date">Created</span>}</div>}
      <ul className={`conversation-list ${isSearchMode ? 'search-results' : 'browse-results'}`} aria-label={isSearchMode ? 'Search results' : 'Conversations'}>
        {isSearchMode ? groups.map(([id, matches], groupIndex) => {
          const primary = matches.find(item => item.index === selectedIndex) || matches[0];
          const { hit, index } = primary;
          const selected = selectedIndex != null ? matches.some(match => match.index === selectedIndex) : props.selectedId === id;
          const others = matches.filter(item => item.index !== index);
          const group = headingForHit(matches[0].hit);
          const previousGroup = groupIndex > 0 ? headingForHit(groups[groupIndex - 1][1][0].hit) : null;
          return <Fragment key={id}>{group && group.key !== previousGroup?.key && <li className="month-heading"><h2>{group.label}</h2></li>}<li className={selected ? 'selected-group' : ''}>
            <div className={`result-item search-item ${selected ? 'selected' : ''}`}>
              <FiMessageSquare className="row-icon" aria-hidden="true" /><span className="result-main"><button className="row-open result-title" data-result-index={index} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(id, index, hit.message_id)}>{hit.conversation_title || 'Untitled conversation'}</button>{display.showPreview && <Snippet value={hit.snippet || hit.conversation_title || ''} />}<span className="result-meta">{display.showSource && <Source platform={hit.platform} />}{display.showDate && <span>{formatDate(hit.conversation_date)}</span>}{display.showCount && <span>{hit.conversation_matches || matches.length} matches</span>}{display.showContent && <ContentBadges values={hit.attributes} compact onFilter={props.onFilterAttribute} />}</span></span><FiArrowRight className="row-arrow" aria-hidden="true" />
            </div>
            {others.length > 0 && <details className="additional-matches"><summary>{others.length} more loaded matches</summary>{others.map(({hit: other, index: n}) => <button key={other.message_id || 'title'} data-result-index={n} onClick={() => onSelect(id, n, other.message_id)}><span className="result-meta">{!display.showPreview && `Match ${n + 1} · `}{other.message_id ? other.role === 'user' ? 'You' : platformName(other.platform) : 'Conversation title'}</span>{display.showPreview && <Snippet value={other.snippet || other.conversation_title || ''} />}</button>)}</details>}
          </li></Fragment>;
        }) : conversations.map((conv, index) => {
          const selected = selectedIndex != null ? selectedIndex === index : props.selectedId === conv.id;
          const group = displayGroup(display.groupBy, conv.platform, conv.created_at);
          const previous = index > 0 ? conversations[index - 1] : null;
          const previousGroup = previous ? displayGroup(display.groupBy, previous.platform, previous.created_at) : null;
          return <Fragment key={conv.id}>{group && group.key !== previousGroup?.key && <li className="month-heading"><h2>{group.label}</h2></li>}<li><div className={`result-item browse-item ${selected ? 'selected' : ''} ${display.showSource ? '' : 'without-source'}`}>
            <FiMessageSquare className="row-icon" aria-hidden="true" /><span className="result-subject"><button className="row-open result-title" data-result-index={index} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(conv.id, index, null)}>{conv.title || 'Untitled conversation'}</button>{display.showContent && <ContentBadges values={conv.attributes} compact onFilter={props.onFilterAttribute} />}</span>{display.showSource && <Source platform={conv.platform} />}{display.showCount && <span className="row-count">{conv.message_count ?? 0}<span className="mobile-message-label"> messages</span></span>}{display.showDate && <time className="row-date" dateTime={conv.created_at}>{formatDate(conv.created_at)}</time>}<FiArrowRight className="row-arrow" aria-hidden="true" />
          </div></li></Fragment>;
        })}
      </ul>
    </>}
    {!loading && !error && items.length > 0 && <div className="list-pagination">{hasMore ? <button onClick={props.onLoadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : `Load 50 more ${isSearchMode ? 'matches' : 'conversations'}`}</button> : <span>All {items.length.toLocaleString()} {isSearchMode ? items.length === 1 ? 'match' : 'matches' : items.length === 1 ? 'conversation' : 'conversations'} shown</span>}</div>}
  </div>;
}
