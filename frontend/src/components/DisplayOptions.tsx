import { useEffect, useId, useRef, useState } from 'react';
import { FiSliders, FiRotateCcw, FiX } from 'react-icons/fi';
import { DEFAULT_DISPLAY, DisplaySettings } from '../utils/display';
import './display.css';

interface Props {
  settings: DisplaySettings;
  onChange: (settings: DisplaySettings) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  isSearchMode: boolean;
}

const properties = [
  ['showSource', 'Source'], ['showDate', 'Date'], ['showCount', 'Message / match count'],
  ['showContent', 'Content badges'], ['showPreview', 'Search previews'],
] as const;

export default function DisplayOptions({ settings, onChange, sort, onSortChange, isSearchMode }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const firstControl = useRef<HTMLSelectElement>(null);
  const id = useId();
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    firstControl.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard, true); };
  }, [open]);

  return <details className="display-options" ref={root} open={open} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <summary id="display-options-trigger" ref={trigger} role="button" aria-label="Display options" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={event => { event.preventDefault(); setOpen(value => !value); }}>
      <FiSliders aria-hidden="true" />Display
    </summary>
    {open && <div className="display-popover" role="dialog" aria-label="Display options" id={id} onKeyDown={event => {
      if (!event.metaKey && !event.ctrlKey && ['j', 'k', '/', '?'].includes(event.key)) event.stopPropagation();
    }}>
      <div className="display-heading"><strong>Display</strong><button className="icon-button" aria-label="Close display options" onClick={() => close(true)}><FiX /></button></div>
      <label className="display-setting"><span>Density</span><select ref={firstControl} aria-label="Row density" value={settings.density} onChange={event => onChange({ ...settings, density: event.target.value as DisplaySettings['density'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
      <label className="display-setting"><span>Group by</span><select aria-label="Group conversations by" value={settings.groupBy} onChange={event => onChange({ ...settings, groupBy: event.target.value as DisplaySettings['groupBy'] })}><option value="date">Date</option><option value="source">Source</option><option value="none">No grouping</option></select></label>
      <label className="display-setting"><span>Sort</span><select aria-label="Sort results" value={!isSearchMode && sort === 'relevance' ? 'newest' : sort} onChange={event => onSortChange(event.target.value)}>{isSearchMode && <option value="relevance">Relevance</option>}<option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      {isSearchMode && settings.groupBy === 'date' && sort === 'relevance' && <p className="display-hint">Date headings appear when sorting newest or oldest. Relevance keeps the strongest matches first.</p>}
      <fieldset className="display-properties"><legend>Visible information</legend>{properties.map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={event => onChange({ ...settings, [key]: event.target.checked })} /><span>{label}</span></label>)}</fieldset>
      <p className="display-hint">Your choices are used where there is room. Narrow panes keep essential information readable.</p>
      <button className="display-reset" onClick={() => { onChange({ ...DEFAULT_DISPLAY }); onSortChange(isSearchMode ? 'relevance' : 'newest'); }}><FiRotateCcw aria-hidden="true" />Reset display</button>
    </div>}
  </details>;
}
