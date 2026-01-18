import { Stats } from '../api/client';

interface FiltersProps {
  stats: Stats | null;
  selectedPlatform: string | null;
  onPlatformChange: (platform: string | null) => void;
}

function Filters({ stats, selectedPlatform, onPlatformChange }: FiltersProps) {
  const platforms = stats?.by_platform ? Object.keys(stats.by_platform) : [];

  return (
    <div className="filters">
      <button
        className={`filter-btn ${!selectedPlatform ? 'active' : ''}`}
        onClick={() => onPlatformChange(null)}
      >
        All
      </button>
      {platforms.map((platform) => (
        <button
          key={platform}
          className={`filter-btn ${selectedPlatform === platform ? 'active' : ''}`}
          onClick={() => onPlatformChange(platform)}
        >
          {platform} ({stats?.by_platform[platform]})
        </button>
      ))}
    </div>
  );
}

export default Filters;
