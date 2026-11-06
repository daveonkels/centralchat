import { useEffect, useState } from 'react';
import { FiChevronUp, FiChevronDown, FiRefreshCw } from 'react-icons/fi';
import { ConversationNeighbors, ConversationTarget, ContentAttribute, getConversationNeighbors } from '../api/client';

interface Props {
  id: string; q?: string; platform?: string; role?: string; before?: string; sort: string;
  attribute?: ContentAttribute; groupBy: 'date' | 'source' | 'none';
  onNavigate: (target: ConversationTarget) => void;
}

export default function ThreadNavigation({ id, q, platform, role, before, sort, attribute, groupBy, onNavigate }: Props) {
  const [neighbors, setNeighbors] = useState<ConversationNeighbors | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setNeighbors(null); setError(false);
    getConversationNeighbors(id, { q, platform, role, before, sort, attribute, group_by: groupBy }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setNeighbors(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id, q, platform, role, before, sort, attribute, groupBy, retry]);

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const target = event.key === 'j' ? neighbors?.next : event.key === 'k' ? neighbors?.previous : null;
      if (target) { event.preventDefault(); onNavigate(target); }
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [neighbors, onNavigate]);

  return <nav className="thread-navigation" aria-label="Conversation navigation">
    <span className="thread-position" role="status">{error ? 'Navigation unavailable' : !neighbors ? 'Loading navigation…' : neighbors.position === null ? 'Outside current view' : <>Thread <strong>{neighbors.position.toLocaleString()} of {neighbors.total.toLocaleString()}</strong></>}</span>
    {error && <button className="icon-button" aria-label="Retry conversation navigation" onClick={() => setRetry(value => value + 1)}><FiRefreshCw /></button>}
    <button className="icon-button" aria-label="Previous conversation" aria-keyshortcuts="k" title="Previous conversation (K)" disabled={!neighbors?.previous} onClick={() => neighbors?.previous && onNavigate(neighbors.previous)}><FiChevronUp /></button>
    <button className="icon-button" aria-label="Next conversation" aria-keyshortcuts="j" title="Next conversation (J)" disabled={!neighbors?.next} onClick={() => neighbors?.next && onNavigate(neighbors.next)}><FiChevronDown /></button>
  </nav>;
}
