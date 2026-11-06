import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArchive, FiDownload, FiMenu, FiSliders, FiBookmark, FiChevronRight, FiX, FiLayers, FiSun, FiMoon } from 'react-icons/fi';
import { contentAttributes } from './components/ContentBadges';
import DisplayOptions from './components/DisplayOptions';
import { DEFAULT_DISPLAY, sanitizeDisplay } from './utils/display';
import CommandPalette from './components/CommandPalette';
import { ViewEditor, ManageViews, ViewEditorState } from './components/SavedViews';
import { SavedView, ViewConfig, listViews, createView, updateView, deleteView } from './api/views';
import ThreadNavigation from './components/ThreadNavigation';
import SearchBar from './components/SearchBar';
import WorkspaceNav from './components/WorkspaceNav';
import { platformName } from './utils/presentation';
import ConversationList from './components/ConversationList';
import MessageViewer from './components/MessageViewer';
import ImportPanel from './components/ImportPanel';
import Dialog from './components/Dialog';
import { search, getConversation, listConversations, getStats, SearchResult, Conversation, Stats, ConversationTarget, ContentAttribute } from './api/client';
import { parseSearchInput } from './utils/search';

const PAGE_SIZE = 50;
const RECENTS = 'central-chat.recent-searches';
function readSaved<T,>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function locationSelection() {
  const match = window.location.pathname.match(/^\/c\/([^/]+)$/);
  try { return { id: match ? decodeURIComponent(match[1]) : null, message: new URLSearchParams(location.search).get('message') }; }
  catch { return { id: null, message: null }; }
}

function App() {
  const [input, setInput] = useState('');
  const [platform, setPlatform] = useState<string | null>(null);
  const [attribute, setAttribute] = useState<ContentAttribute | ''>('');
  const [listTotal, setListTotal] = useState<number | null>(null);
  const [role, setRole] = useState('');
  const [before, setBefore] = useState('');
  const [sort, setSort] = useState('relevance');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(!!locationSelection().id);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [display, setDisplay] = useState(() => sanitizeDisplay(readSaved('central-chat.display', {
    ...DEFAULT_DISPLAY, density: readSaved<string>('central-chat.density', 'compact'),
  })));
  const density = display.density;
  useEffect(() => { try { localStorage.setItem('central-chat.display', JSON.stringify(display)); } catch { /* Optional preference. */ } }, [display]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsLoading, setViewsLoading] = useState(true);
  const [viewsError, setViewsError] = useState('');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewEditor, setViewEditor] = useState<ViewEditorState | null>(null);
  const [showManageViews, setShowManageViews] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const viewsRequest = useRef(0);
  const loadViews = useCallback(() => {
    const generation = ++viewsRequest.current;
    setViewsLoading(true); setViewsError('');
    listViews().then(data => { if (generation === viewsRequest.current) setViews(data); })
      .catch(error => { if (generation === viewsRequest.current) setViewsError(error instanceof Error ? error.message : 'Could not load saved views.'); })
      .finally(() => { if (generation === viewsRequest.current) setViewsLoading(false); });
  }, []);
  useEffect(loadViews, [loadViews]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = readSaved<unknown>(RECENTS, []);
    return Array.isArray(saved) ? saved.filter((s): s is string => typeof s === 'string').slice(0, 6) : [];
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => readSaved<string>('central-chat.theme', 'dark') === 'light' ? 'light' : 'dark');
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef(0);
  const readerRequestId = useRef(0);
  const lastSelection = useRef(locationSelection());
  const listRef = useRef<HTMLElement>(null);
  const parsed = parseSearchInput(input);
  const isSearchMode = !!(input.trim() || role || before);
  const loaded = isSearchMode ? results.length : conversations.length;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('central-chat.theme', JSON.stringify(theme)); } catch { /* Storage can be disabled. */ }
  }, [theme]);

  const refreshStats = useCallback(() => { getStats().then(setStats).catch(() => setStats(null)); }, []);
  useEffect(refreshStats, [refreshStats, refresh]);

  const fetchPage = useCallback(async (offset: number, append: boolean, generation: number) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      if (input.trim() || role || before) {
        const terms = parseSearchInput(input);
        const data = await search(terms.text || '__cc_match_all__', {
          platform: terms.platform || platform || undefined, role: terms.role || role || undefined,
          before: terms.before || before || undefined, attribute: attribute || undefined, group_by: display.groupBy, sort, limit: PAGE_SIZE, offset,
        });
        if (generation !== requestId.current) return;
        setResults(prev => append ? [...prev, ...data.results] : data.results);
        setTotal(data.total);
        setConversationTotal(data.conversations);
        setHasMore(offset + data.results.length < data.total);
      } else {
        const data = await listConversations({ platform: platform || undefined, attribute: attribute || undefined, group_by: display.groupBy, sort: sort === 'oldest' ? 'oldest' : 'newest', limit: PAGE_SIZE, offset });
        if (generation !== requestId.current) return;
        setConversations(prev => append ? [...prev, ...data.conversations] : data.conversations);
        setListTotal(data.total);
        setHasMore(data.total === null ? data.conversations.length === PAGE_SIZE : offset + data.conversations.length < data.total);
      }
    } catch (err) {
      if (generation === requestId.current) setError(err instanceof Error ? err.message : 'The server could not be reached. Try again.');
    } finally {
      if (generation === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [input, platform, role, before, sort, attribute, display.groupBy]);

  useEffect(() => {
    const generation = ++requestId.current;
    setLoading(true); setLoadingMore(false); setSelectedIndex(null); setResults([]); setConversations([]); setHasMore(false);
    const timer = window.setTimeout(() => { void fetchPage(0, false, generation); }, input ? 300 : 0);
    return () => { clearTimeout(timer); ++requestId.current; };
  }, [fetchPage, refresh]);

  const remember = useCallback(() => {
    const value = input.trim();
    if (!value) return;
    setRecentSearches(prev => {
      const next = [value, ...prev.filter(s => s.toLowerCase() !== value.toLowerCase())].slice(0, 6);
      try { localStorage.setItem(RECENTS, JSON.stringify(next)); } catch { /* Optional convenience. */ }
      return next;
    });
  }, [input]);

  const openConversation = useCallback(async (id: string, target: string | null, push = true) => {
    const generation = ++readerRequestId.current;
    lastSelection.current = { id, message: target };
    setReaderOpen(true); setReaderLoading(true); setReaderError(null); setMessageId(target);
    if (push) {
      const url = `/c/${encodeURIComponent(id)}${target ? `?message=${encodeURIComponent(target)}` : ''}`;
      window.history.pushState({}, '', url);
    }
    try {
      const data = await getConversation(id);
      if (generation === readerRequestId.current) setSelected(data);
    } catch (err) {
      if (generation === readerRequestId.current) setReaderError(err instanceof Error ? err.message : 'Could not open this conversation.');
    } finally { if (generation === readerRequestId.current) setReaderLoading(false); }
  }, []);

  useEffect(() => {
    const navigate = () => {
      const next = locationSelection();
      setSelectedIndex(null);
      if (next.id) void openConversation(next.id, next.message, false);
      else { ++readerRequestId.current; setReaderOpen(false); setSelected(null); setReaderLoading(false); setReaderError(null); }
    };
    navigate();
    window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, [openConversation]);

  const select = useCallback((id: string, index: number, target: string | null) => {
    setSelectedIndex(index); remember(); void openConversation(id, target);
  }, [openConversation, remember]);

  const navigateThread = useCallback((target: ConversationTarget) => {
    const index = isSearchMode
      ? results.findIndex(result => result.conversation_id === target.conversation_id && result.message_id === target.message_id)
      : conversations.findIndex(conversation => conversation.id === target.conversation_id);
    setSelectedIndex(index < 0 ? null : index);
    void openConversation(target.conversation_id, target.message_id);
  }, [conversations, results, isSearchMode, openConversation]);

  const backToResults = useCallback(() => {
    ++readerRequestId.current;
    setReaderLoading(false); setReaderOpen(false); setReaderError(null);
    window.history.pushState({}, '', '/');
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLButtonElement>(`[data-result-index="${selectedIndex}"]`);
      const details = row?.closest('details');
      if (details) details.open = true;
      (row || listRef.current)?.focus({ preventScroll: true });
    });
  }, [selectedIndex]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (event.key === '?') { event.preventDefault(); setShowHelp(true); }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, []);

  const resetFilters = () => { setInput(''); setPlatform(null); setRole(''); setBefore(''); setAttribute(''); setSort('relevance'); };
  const stepMatch = (delta: number) => {
    if (selectedIndex === null) return;
    const next = selectedIndex + delta;
    const result = results[next];
    if (result) select(result.conversation_id, next, result.message_id);
  };
  const importComplete = useCallback(() => { setRefresh(v => v + 1); }, []);
  const browseTotal = listTotal;

  const activeProvider = parsed.platform || platform;
  const activeFilters = [activeProvider, parsed.role || role, parsed.before || before, attribute].filter(Boolean).length;
  const activeView = views.find(view => view.id === activeViewId);
  const pageTitle = activeView ? activeView.name : isSearchMode ? 'Search results' : activeProvider ? platformName(activeProvider) : 'All conversations';
  const changeQuery = (value: string) => {
    ++readerRequestId.current;
    setInput(value); setReaderOpen(false); setReaderLoading(false); setReaderError(null);
    window.history.replaceState({}, '', '/');
  };
  const chooseProvider = (value: string | null) => {
    setInput(input.replace(/\bplatform:\S+/gi, '').trim()); setPlatform(value); backToResults(); setShowNav(false);
  };
  const filterAttribute = (value: ContentAttribute | '') => {
    setAttribute(value); backToResults();
    requestAnimationFrame(() => document.querySelector<HTMLElement>(value ? '#active-content-filter' : '#archive-search')?.focus());
  };
  const focusSearch = () => {
    setShowNav(false);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#archive-search')?.focus());
  };
  const goHome = () => {
    setActiveViewId(null); resetFilters(); setShowFilters(false); backToResults(); setShowNav(false);
  };
  const currentViewConfig: ViewConfig = {
    query: input, platform: platform as ViewConfig['platform'], role: role as ViewConfig['role'], before,
    attribute, sort: sort as ViewConfig['sort'], display,
  };
  const viewModified = !!activeView && (['query', 'platform', 'role', 'before', 'attribute', 'sort'] as const).some(key => activeView.config[key] !== currentViewConfig[key])
    || !!activeView && (Object.keys(DEFAULT_DISPLAY) as (keyof typeof DEFAULT_DISPLAY)[]).some(key => activeView.config.display[key] !== display[key]);
  const applyView = (view: SavedView) => {
    const config = view.config;
    setInput(config.query); setPlatform(config.platform); setRole(config.role); setBefore(config.before);
    setAttribute(config.attribute); setSort(config.sort); setDisplay(sanitizeDisplay(config.display));
    setActiveViewId(view.id); setShowNav(false); setShowManageViews(false); setShowFilters(false); backToResults();
  };
  const openViewEditor = (kind: ViewEditorState['kind'], view?: SavedView) => {
    setShowNav(false); setShowManageViews(false);
    requestAnimationFrame(() => setViewEditor({ kind, view, config: kind === 'rename' && view ? view.config : currentViewConfig }));
  };
  const saveEditedView = async (name: string) => {
    if (!viewEditor) return;
    const saved = viewEditor.kind === 'create'
      ? await createView(name, viewEditor.config)
      : await updateView(viewEditor.view!.id, viewEditor.kind === 'rename' ? { name } : { name, config: viewEditor.config });
    ++viewsRequest.current; setViewsLoading(false);
    setViews(previous => [...previous.filter(view => view.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setViewsError('');
    if (viewEditor.kind !== 'rename') setActiveViewId(saved.id);
    setViewEditor(null);
  };
  const removeSavedView = async (id: string) => {
    await deleteView(id); ++viewsRequest.current; setViewsLoading(false); setViewsError(''); setViews(previous => previous.filter(view => view.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  };
  const openManageViews = () => { setShowNav(false); requestAnimationFrame(() => setShowManageViews(true)); };
  const openCommands = () => { setShowNav(false); setShowCommands(true); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      if (document.querySelector('dialog[open]') && !showCommands) return;
      event.preventDefault(); setShowCommands(value => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCommands]);
  const commandActions = [
    { id: 'search', label: 'Search archive', group: 'Navigate', keywords: 'find conversations', onSelect: focusSearch },
    { id: 'home', label: 'All conversations', group: 'Navigate', keywords: 'home reset clear', onSelect: goHome },
    ...views.map(view => ({ id: `view-${view.id}`, label: view.name, group: 'Saved views', description: 'Open saved view', onSelect: () => applyView(view) })),
    { id: 'save-view', label: 'Save current view', group: 'Views', onSelect: () => openViewEditor('create') },
    ...(activeView && viewModified ? [{ id: 'update-view', label: `Update ${activeView.name}`, group: 'Views', onSelect: () => openViewEditor('update', activeView) }] : []),
    { id: 'manage-views', label: 'Manage saved views', group: 'Views', keywords: 'rename remove delete', onSelect: openManageViews },
    ...Object.entries(contentAttributes).map(([value, info]) => ({ id: `content-${value}`, label: `Filter by ${info.label}`, group: 'Content filters', onSelect: () => filterAttribute(value as ContentAttribute) })),
    ...(attribute ? [{ id: 'clear-content', label: 'Remove content filter', group: 'Content filters', onSelect: () => filterAttribute('') }] : []),
    ...['openai', 'claude', 'raycast'].map(value => ({ id: `source-${value}`, label: `Show ${platformName(value)} conversations`, group: 'Sources', onSelect: () => chooseProvider(value) })),
    { id: 'filters', label: 'Edit filters', group: 'Actions', keywords: 'role date source', onSelect: () => { setShowFilters(true); requestAnimationFrame(() => document.getElementById('content-filter')?.focus()); } },
    { id: 'display', label: 'Display options', group: 'Actions', keywords: 'density grouping metadata sort', onSelect: () => document.getElementById('display-options-trigger')?.click() },
    { id: 'import', label: 'Import conversations', group: 'Actions', keywords: 'detect upload exports', onSelect: () => setShowImport(true) },
    { id: 'theme', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, group: 'Actions', keywords: 'appearance mode', onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { id: 'help', label: 'Help & shortcuts', group: 'Actions', onSelect: () => setShowHelp(true) },
  ];
  const navigation = <WorkspaceNav stats={stats} platform={activeProvider} searching={isSearchMode} recentSearches={recentSearches}
    views={views} activeViewId={viewModified ? null : activeViewId} viewsLoading={viewsLoading} viewsError={viewsError}
    onView={applyView} onManageViews={openManageViews} onSaveView={() => openViewEditor('create')}
    onArchive={goHome} onProvider={chooseProvider}
    onSearch={focusSearch} onRecent={value => { changeQuery(value); setShowNav(false); }}
    onImport={() => { setShowNav(false); setShowImport(true); }} onHelp={() => { setShowNav(false); setShowHelp(true); }} />;

  return (
    <div className={`app-shell ${readerOpen ? 'reader-open' : ''} density-${density}`}>
      <a className="skip-link" href="#archive-content">Skip to archive</a>
      <aside className="workspace-nav">{navigation}</aside>
      <main className="workspace" id="archive-content">
        <header className="workspace-header">
          <a className="mobile-home" href="/" aria-label="Go to archive home" onClick={event => { event.preventDefault(); goHome(); }}><span className="brand-symbol"><FiLayers aria-hidden="true" /></span></a>
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setShowNav(true)}><FiMenu /></button>
          <div className="breadcrumb"><FiArchive aria-hidden="true" /><span className="breadcrumb-parent">Archive</span><FiChevronRight className="breadcrumb-divider" aria-hidden="true" /><h1>{pageTitle}</h1></div>
          <div className="workspace-header-actions"><span className="archive-label"><span className="status-dot" />Personal archive</span><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <FiSun /> : <FiMoon />}</button><button className="primary-button" onClick={() => setShowImport(true)}><FiDownload aria-hidden="true" /><span>Import</span></button></div>
        </header>
        <div className="workspace-tools">
          <SearchBar value={input} onChange={changeQuery} loading={loading && isSearchMode} recentSearches={recentSearches} onSelectRecent={changeQuery} onToggleHelp={() => setShowHelp(true)} onCommit={remember} onCommands={openCommands} />
          <div className="view-controls">
            <button className={`filter-toggle ${showFilters || activeFilters ? 'active' : ''}`} aria-expanded={showFilters} aria-controls="archive-filters" onClick={() => setShowFilters(!showFilters)}><FiSliders aria-hidden="true" />Filters{activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}</button>
            <DisplayOptions settings={display} onChange={setDisplay} sort={sort} onSortChange={setSort} isSearchMode={isSearchMode} />
            <button className="save-view-button" onClick={() => openViewEditor('create')}><FiBookmark aria-hidden="true" />Save view</button>
          </div>
        </div>
        {activeView && <div className="saved-view-context"><FiBookmark aria-hidden="true" /><span>{activeView.name}</span><span className="saved-view-state">{viewModified ? 'Modified' : 'Saved view'}</span>{viewModified && <><button onClick={() => openViewEditor('update', activeView)}>Update view</button><button onClick={() => applyView(activeView)}>Reset to saved</button></>}</div>}
        {attribute && <div className="active-content-filter"><span>Content</span><button id="active-content-filter" className={`content-badge attribute-${attribute}`} aria-label={`Remove ${contentAttributes[attribute].label} filter`} onClick={() => filterAttribute('')}>{contentAttributes[attribute].label}<FiX aria-hidden="true" /></button><span>within this view</span></div>}
        {showFilters && <div className="filter-panel" id="archive-filters">
          <label>Source<select aria-label="Source" value={activeProvider || ''} onChange={e => chooseProvider(e.target.value || null)}><option value="">All sources</option><option value="openai">ChatGPT</option><option value="claude">Claude</option><option value="raycast">Raycast</option></select></label>
          <label>Content<select id="content-filter" aria-label="Content type" value={attribute} onChange={e => filterAttribute(e.target.value as ContentAttribute | '')}><option value="">Any content</option>{Object.entries(contentAttributes).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></label>
          <label>Message role<select aria-label="Message role" value={parsed.role || role} onChange={e => { setInput(input.replace(/\b(?:role|from):\S+/gi, '').trim()); setRole(e.target.value); backToResults(); }}><option value="">Any role</option><option value="user">You</option><option value="assistant">Assistant</option><option value="system">System</option><option value="tool">Tool</option></select></label>
          <label>Before date<input aria-label="Before date" type="date" value={parsed.before || before} onChange={e => { setInput(input.replace(/\bbefore:\S+/gi, '').trim()); setBefore(e.target.value); backToResults(); }} /></label>
          <button className="text-button" onClick={() => { setInput(parsed.text); setPlatform(null); setRole(''); setBefore(''); setAttribute(''); backToResults(); }}>Reset filters</button>
          <button className="icon-button" aria-label="Close filters" onClick={() => setShowFilters(false)}><FiX /></button>
        </div>}
        <div className="archive-layout">
          <section ref={listRef} tabIndex={-1} className="archive-sidebar" aria-label="Find conversations">
            <div className="results-toolbar"><div role="status" aria-live="polite">{loading ? 'Loading conversations…' : isSearchMode ? <><strong>{total.toLocaleString()}</strong> matches <span>in {conversationTotal.toLocaleString()} {conversationTotal === 1 ? 'conversation' : 'conversations'}</span></> : <><strong>{browseTotal?.toLocaleString() ?? loaded.toLocaleString()}</strong> {browseTotal === 1 ? 'conversation' : 'conversations'}</>}</div><span className="results-caption">{isSearchMode ? 'Title & message matches' : 'Your conversations, together'}</span></div>
            <ConversationList display={display} sort={sort} results={results} conversations={conversations} loading={loading} selectedId={readerOpen ? selected?.id : undefined}
              selectedIndex={readerOpen ? selectedIndex : null} onSelect={select} onFilterAttribute={filterAttribute} hasFilters={!!activeFilters} isSearchMode={isSearchMode} error={error}
              hasMore={hasMore} loadingMore={loadingMore} onLoadMore={() => { if (!loadingMore) void fetchPage(loaded, true, requestId.current); }}
              onRetry={() => void fetchPage(error && loaded > 0 && !loading ? loaded : 0, !!loaded && !loading, requestId.current)}
              onReset={resetFilters} onImport={() => setShowImport(true)} />
            <footer className="archive-footer"><span>{loaded.toLocaleString()} {isSearchMode ? 'matches' : 'conversations'} loaded</span><span><kbd>↑</kbd><kbd>↓</kbd> to navigate · <kbd>↵</kbd> to open</span></footer>
          </section>
        <MessageViewer conversation={selected} messageId={messageId} loading={readerLoading} error={readerError}
          searching={isSearchMode} onFilterAttribute={filterAttribute}
          threadNavigation={readerOpen && selected && !readerLoading && !readerError ? <ThreadNavigation id={selected.id}
            groupBy={display.groupBy} attribute={attribute || undefined} q={isSearchMode ? parsed.text || '__cc_match_all__' : undefined} platform={parsed.platform || platform || undefined}
            role={parsed.role || role || undefined} before={parsed.before || before || undefined}
            sort={!isSearchMode && sort === 'relevance' ? 'newest' : sort} onNavigate={navigateThread} /> : null}
          onRetry={() => { const target = lastSelection.current; if (target.id) void openConversation(target.id, target.message, false); }}
          onBack={backToResults} onImport={() => setShowImport(true)}
          resultIndex={!loading && isSearchMode ? selectedIndex : null} resultTotal={total} onStep={stepMatch}
          hasPrevious={selectedIndex !== null && selectedIndex > 0} hasNext={selectedIndex !== null && selectedIndex + 1 < results.length}
          hasMoreResults={hasMore && isSearchMode} onLoadMore={() => void fetchPage(loaded, true, requestId.current)} loadingMore={loadingMore}
          highlightSnippet={selectedIndex !== null && isSearchMode ? results[selectedIndex]?.snippet : undefined} />
        </div>
      </main>
      {showCommands && <CommandPalette actions={commandActions} onClose={() => setShowCommands(false)} onSearch={query => { changeQuery(query); focusSearch(); }} />}
      {viewEditor && <ViewEditor editor={viewEditor} onClose={() => setViewEditor(null)} onSave={saveEditedView} />}
      {showManageViews && <ManageViews views={views} error={viewsError} onClose={() => setShowManageViews(false)} onOpen={applyView} onRename={view => openViewEditor('rename', view)} onDelete={removeSavedView} onRetry={loadViews} onCreate={() => openViewEditor('create')} />}
      {showNav && <Dialog title="Workspace" onClose={() => setShowNav(false)} className="navigation-dialog">{navigation}</Dialog>}
      {showImport && <Dialog title="Imports & data" onClose={() => setShowImport(false)} className="import-dialog"><ImportPanel onImportComplete={importComplete} /></Dialog>}
      {showHelp && <Dialog title="Search your archive" onClose={() => setShowHelp(false)}>
        <p>Find words in conversation titles and messages. Choose a result to jump directly to that message.</p>
        <dl className="help-list"><dt><kbd>⌘ / Ctrl K</kbd></dt><dd>Open commands and saved views</dd><dt><kbd>/</kbd></dt><dd>Focus archive search</dd><dt><kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>Move between results when a result is focused</dd><dt><kbd>Enter</kbd></dt><dd>Open the focused result</dd><dt><kbd>Escape</kbd></dt><dd>Close a dialog; clear the focused search field</dd></dl>
        <p>While reading, press <kbd>J</kbd> for the next conversation or <kbd>K</kbd> for the previous one. Navigation follows the current filters and sort order, across the entire archive. Search visits each matching conversation once.</p>
        <h3>More precise searches</h3><p>Combine words with <code>platform:claude</code>, <code>role:user</code>, or <code>before:2025-01-01</code>. Use quotation marks for an exact phrase. Search also supports FTS operators such as <code>OR</code> and prefix searches like <code>garden*</code>.</p>
      </Dialog>}
    </div>
  );
}
export default App;
