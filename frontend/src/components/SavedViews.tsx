import { FormEvent, useEffect, useRef, useState } from 'react';
import { FiBookmark, FiEdit2, FiTrash2 } from 'react-icons/fi';
import Dialog from './Dialog';
import { SavedView, ViewConfig } from '../api/views';
import { contentAttributes } from './ContentBadges';
import { platformName } from '../utils/presentation';
import './savedViews.css';

export function viewDescription(config: ViewConfig) {
  return [config.query ? `“${config.query}”` : 'All conversations', config.platform ? platformName(config.platform) : '',
    config.attribute ? contentAttributes[config.attribute].label : '', config.role ? `Role: ${config.role}` : '',
    config.before ? `Before ${config.before}` : ''].filter(Boolean).join(' · ');
}

export interface ViewEditorState { kind: 'create' | 'update' | 'rename'; view?: SavedView; config: ViewConfig }

export function ViewEditor({ editor, onClose, onSave }: {
  editor: ViewEditorState; onClose: () => void; onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(editor.view?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => nameInput.current?.focus()); return () => cancelAnimationFrame(frame); }, []);
  const title = editor.kind === 'rename' ? 'Rename saved view' : editor.kind === 'update' ? 'Update saved view' : 'Save current view';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try { await onSave(name.trim()); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save this view.'); setBusy(false); }
  };
  return <Dialog title={title} onClose={onClose} canClose={!busy} className="saved-view-dialog">
    <form onSubmit={submit} className="saved-view-form">
      <label>View name<input ref={nameInput} required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="For example, Claude with code" disabled={busy} /></label>
      <p className="view-description">{viewDescription(editor.config)}</p>
      <p className="view-storage-note">{editor.kind === 'rename' ? 'Only the name changes.' : 'Saves your search, filters, sorting, and display settings. Available on all your devices.'}</p>
      {error && <p role="alert" className="view-error">{error}</p>}
      <div className="view-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : editor.kind === 'rename' ? 'Rename' : editor.kind === 'update' ? 'Update view' : 'Save view'}</button></div>
    </form>
  </Dialog>;
}

export function ManageViews({ views, error, onClose, onOpen, onRename, onDelete, onRetry, onCreate }: {
  views: SavedView[]; error: string; onClose: () => void; onOpen: (view: SavedView) => void;
  onRename: (view: SavedView) => void; onDelete: (id: string) => Promise<void>; onRetry: () => void; onCreate: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const rows = useRef<HTMLUListElement>(null);
  const create = useRef<HTMLButtonElement>(null);
  const remove = async (id: string) => {
    setBusy(true); setFailure('');
    const index = views.findIndex(view => view.id === id);
    try {
      await onDelete(id); setRemoving(null);
      requestAnimationFrame(() => {
        const buttons = rows.current?.querySelectorAll<HTMLButtonElement>('.view-open');
        (buttons?.[Math.min(index, buttons.length - 1)] || create.current)?.focus();
      });
    } catch (err) { setFailure(err instanceof Error ? err.message : 'Could not remove this view.'); }
    finally { setBusy(false); }
  };
  return <Dialog title="Saved views" onClose={onClose} canClose={!busy} className="saved-view-dialog">
    <p className="view-storage-note">Reusable searches and display settings, available on all your devices.</p>
    {error && <div className="view-error" role="alert"><p>{error}</p><button onClick={onRetry}>Retry saved views</button></div>}
    {failure && <p className="view-error" role="alert">{failure}</p>}
    <ul className="manage-views-list" ref={rows}>{views.map(view => <li key={view.id}>
      <div className="manage-view-row"><button className="view-open" disabled={busy} onClick={() => onOpen(view)}><FiBookmark aria-hidden="true" /><span><strong>{view.name}</strong><small>{viewDescription(view.config)}</small></span></button>
        <button className="icon-button" disabled={busy} aria-label={`Rename ${view.name}`} onClick={() => onRename(view)}><FiEdit2 /></button>
        <button className="icon-button" disabled={busy} aria-label={`Remove ${view.name}`} onClick={() => { setRemoving(view.id); setFailure(''); }}><FiTrash2 /></button></div>
      {removing === view.id && <div className="remove-view-confirm"><p>Remove “{view.name}”? Your conversations stay in the archive.</p><div><button disabled={busy} onClick={() => setRemoving(null)}>Keep view</button><button disabled={busy} onClick={() => void remove(view.id)}>{busy ? 'Removing…' : 'Remove saved view'}</button></div></div>}
    </li>)}</ul>
    {!views.length && !error && <p className="empty-views">No saved views yet. Set your filters, then save a view to return to them.</p>}
    <div className="view-dialog-actions"><button ref={create} className="primary-button" disabled={busy} onClick={onCreate}>Save current view</button></div>
  </Dialog>;
}
