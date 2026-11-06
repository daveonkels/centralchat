import { FiArchive, FiSearch, FiUpload, FiClock, FiHelpCircle, FiLayers, FiBookmark, FiMoreHorizontal, FiPlus } from 'react-icons/fi';
import { SavedView } from '../api/views';
import { PlatformIcon } from './PlatformIcons';
import { Stats } from '../api/client';
import { platformName } from '../utils/presentation';

interface Props {
  stats: Stats | null; platform: string | null; searching: boolean;
  recentSearches: string[];
  views: SavedView[]; activeViewId: string | null; viewsLoading: boolean; viewsError: string;
  onView: (view: SavedView) => void; onManageViews: () => void; onSaveView: () => void;
  onArchive: () => void; onProvider: (value: string) => void; onSearch: () => void;
  onRecent: (value: string) => void; onImport: () => void; onHelp: () => void;
}
export default function WorkspaceNav(props: Props) {
  return <div className="workspace-nav-content">
    <button className="workspace-brand" onClick={props.onArchive}><span className="brand-symbol"><FiLayers aria-hidden="true" /></span><span>Central Chat<small>Personal workspace</small></span></button>
    <nav aria-label="Workspace navigation">
      <div className="nav-section">
        <button className={`nav-item ${!props.activeViewId && props.searching ? 'active' : ''}`} onClick={props.onSearch}><FiSearch aria-hidden="true" /><span>Search</span><kbd>/</kbd></button>
        <button className={`nav-item ${!props.platform && !!props.activeViewId && props.searching ? 'active' : ''}`} aria-current={!props.activeViewId && !props.platform && !props.searching ? 'page' : undefined} onClick={props.onArchive}><FiArchive aria-hidden="true" /><span>All conversations</span><span className="nav-count">{props.stats?.total_conversations.toLocaleString()}</span></button>
        <button className="nav-item" onClick={props.onImport}><FiUpload aria-hidden="true" /><span>Imports</span></button>
      </div>
      <div className="nav-section"><h2>Sources</h2>{['openai','claude','raycast'].map(platform => <button key={platform} className={`nav-item ${!props.activeViewId && props.platform === platform ? 'active' : ''}`} aria-current={!props.activeViewId && props.platform === platform ? 'page' : undefined} onClick={() => props.onProvider(platform)}><span className={`source-icon ${platform}`}><PlatformIcon platform={platform} size={16} /></span><span>{platformName(platform)}</span><span className="nav-count">{props.stats?.by_platform[platform]?.toLocaleString() || '0'}</span></button>)}</div>
      <div className="nav-section saved-views-nav"><div className="saved-nav-heading"><h2>Saved views</h2><button className="icon-button" aria-label="Manage saved views" title="Manage saved views" onClick={props.onManageViews}><FiMoreHorizontal /></button></div>
        {props.viewsLoading && <p className="views-nav-error">Loading saved views…</p>}
        {props.viewsError && <button className="nav-item" onClick={props.onManageViews}>Saved views unavailable</button>}
        {props.views.map(view => <button key={view.id} className={`nav-item ${props.activeViewId === view.id ? 'active' : ''}`} aria-current={props.activeViewId === view.id ? 'page' : undefined} onClick={() => props.onView(view)} title={view.name}><FiBookmark aria-hidden="true" /><span>{view.name}</span></button>)}
        <button className="nav-item" onClick={props.onSaveView}><FiPlus aria-hidden="true" /><span>Save current view</span></button>
      </div>
      {props.recentSearches.length > 0 && <div className="nav-section recent-nav"><h2>Recent searches</h2>{props.recentSearches.slice(0,5).map(query => <button key={query} className="nav-item" onClick={() => props.onRecent(query)} title={query}><FiClock aria-hidden="true" /><span>{query}</span></button>)}</div>}
    </nav>
    <div className="nav-bottom"><div className="archive-health"><span className="status-dot" /><div>Personal archive<small>{props.stats ? `${props.stats.total_messages.toLocaleString()} messages` : 'Stored on your server'}</small></div></div><div className="nav-utilities"><button onClick={props.onHelp}><FiHelpCircle aria-hidden="true" />Help & shortcuts</button></div></div>
  </div>;
}
