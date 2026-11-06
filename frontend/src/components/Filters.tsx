import { Stats } from '../api/client';
import { platformName } from '../utils/presentation';
interface Props { stats: Stats | null; selectedPlatform: string | null; onPlatformChange: (platform: string | null) => void }
export default function Filters({ selectedPlatform, onPlatformChange }: Props) {
  return <div className="filters" role="group" aria-label="Filter by provider">
    {[null, 'openai', 'claude', 'raycast'].map(platform => <button key={platform || 'all'} className={`filter-btn ${platform === selectedPlatform ? 'active' : ''}`} aria-pressed={platform === selectedPlatform} onClick={() => onPlatformChange(platform)}>
      {platform && <span aria-hidden="true" className={`provider-dot ${platform}`} />}{platform ? platformName(platform) : 'All'}
    </button>)}
  </div>;
}
