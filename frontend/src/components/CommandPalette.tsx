import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FiArrowUpRight, FiCommand, FiSearch } from 'react-icons/fi';
import Dialog from './Dialog';
import { commandIndex, filterCommands, groupCommands, SearchableCommand } from '../utils/commands';
import './commandPalette.css';

export interface CommandAction extends SearchableCommand {
  onSelect: () => void;
}

interface Props {
  actions: CommandAction[];
  onClose: () => void;
  onSearch: (query: string) => void;
  initialQuery?: string;
}

export default function CommandPalette({ actions, onClose, onSearch, initialQuery = '' }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [activeId, setActiveId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const dispatching = useRef(false);
  const id = useId();
  const matching = useMemo(() => filterCommands(actions, query), [actions, query]);
  const searchQuery = query.trim();
  const groups = useMemo(() => {
    const grouped = groupCommands(matching);
    if (searchQuery) {
      const searchAction: CommandAction = {
      id: `${id}-archive-search`, label: `Search archive for “${searchQuery}”`,
      description: 'Search conversation titles and messages in the current view',
      group: 'Search archive', onSelect: () => onSearch(searchQuery),
      };
      const searchGroup = grouped.find(group => group.name === 'Search archive');
      if (searchGroup) searchGroup.actions.push(searchAction);
      else grouped.push({ name: 'Search archive', actions: [searchAction] });
    }
    return grouped;
  }, [matching, searchQuery, id, onSearch]);
  const visible = useMemo(() => groups.flatMap(group => group.actions), [groups]);
  const index = commandIndex(visible, activeId);
  const selected = index >= 0 ? visible[index] : undefined;
  const optionId = (actionId: string) => `${id}-option-${encodeURIComponent(actionId)}`;

  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (selected?.id !== activeId) setActiveId(selected?.id ?? null);
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id, activeId, query]);

  const execute = (action: CommandAction) => {
    if (dispatching.current) return;
    dispatching.current = true;
    onClose();
    // Let Dialog restore its opener before the action opens/focuses another UI.
    requestAnimationFrame(() => action.onSelect());
  };

  return <Dialog title="Commands" onClose={onClose} className="command-dialog">
    <div className="command-search">
      <FiSearch aria-hidden="true" />
      <input ref={input} role="combobox" aria-label="Search commands" aria-autocomplete="list"
        aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={selected ? optionId(selected.id) : undefined}
        aria-describedby={`${id}-help`} value={query} maxLength={2000} placeholder="Search actions, views, or your archive…"
        autoComplete="off" spellCheck={false} onChange={event => { setQuery(event.target.value); setActiveId(null); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (visible.length) {
              const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
              setActiveId(visible[next].id);
            }
          } else if (event.key === 'Home' || event.key === 'End') {
            if (!visible.length) return;
            // Preserve normal text editing; Ctrl/Meta + Home/End chooses an edge.
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault(); setActiveId(visible[event.key === 'Home' ? 0 : visible.length - 1].id);
          } else if (event.key === 'Enter' && selected) {
            event.preventDefault(); execute(selected);
          }
        }} />
    </div>
    <div className="command-count" role="status" aria-live="polite">{matching.length ? `${matching.length} ${matching.length === 1 ? 'command' : 'commands'}` : searchQuery ? 'No matching commands. You can search the archive instead.' : 'No commands available.'}</div>
    <div ref={list} id={`${id}-results`} className="command-results" role="listbox" aria-label="Available commands">
      {groups.map(group => <div role="group" aria-label={group.name} className="command-group" key={group.name}>
        <div className="command-group-label" aria-hidden="true">{group.name}</div>
        {group.actions.map(action => <div key={action.id} id={optionId(action.id)} role="option" aria-selected={selected?.id === action.id}
          aria-label={action.label} aria-describedby={action.description ? `${optionId(action.id)}-description` : undefined}
          className="command-option" onMouseDown={event => event.preventDefault()} onMouseMove={() => setActiveId(action.id)}
          onClick={() => execute(action)}>
          {action.id === `${id}-archive-search` ? <FiSearch aria-hidden="true" /> : <FiCommand aria-hidden="true" />}
          <span className="command-option-copy"><span>{action.label}</span>{action.description && <small id={`${optionId(action.id)}-description`}>{action.description}</small>}</span>
          <FiArrowUpRight className="command-option-arrow" aria-hidden="true" />
        </div>)}
      </div>)}
    </div>
    <div className="command-footer" id={`${id}-help`}><span><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to run</span><span><kbd>Esc</kbd> to close</span></div>
  </Dialog>;
}
