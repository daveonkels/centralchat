import { Stats } from '../api/client';
import { PlatformIcon } from './PlatformIcons';

interface FiltersProps {
  stats: Stats | null;
  selectedPlatform: string | null;
  onPlatformChange: (platform: string | null) => void;
}

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

// Display names for platforms (backend uses internal names)
function getPlatformDisplayName(platform: string): string {
  const displayNames: Record<string, string> = {
    openai: 'ChatGPT',
    claude: 'Claude',
    raycast: 'Raycast',
  };
  return displayNames[platform] || platform;
}

function Filters({ stats, selectedPlatform, onPlatformChange }: FiltersProps) {
  const platforms = stats?.by_platform ? Object.keys(stats.by_platform) : [];
  const totalCount = stats?.total_conversations ?? 0;

  return (
    <div className="filters">
      <button
        className={`filter-btn ${!selectedPlatform ? 'active' : ''}`}
        onClick={() => onPlatformChange(null)}
        data-platform="all"
      >
        All
        <span className="filter-count">{formatCount(totalCount)}</span>
      </button>
      {platforms.map((platform) => {
        const count = stats?.by_platform[platform] ?? 0;
        const platformClass = selectedPlatform === platform ? `active ${platform}-filter` : '';

        return (
          <button
            key={platform}
            className={`filter-btn ${platformClass}`}
            onClick={() => onPlatformChange(platform)}
            data-platform={platform}
          >
            <span className={`platform-icon ${platform}`}>
              <PlatformIcon platform={platform} size={14} />
            </span>
            {getPlatformDisplayName(platform)}
            <span className="filter-count">{formatCount(count)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default Filters;
