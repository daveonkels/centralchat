import { FiCode, FiImage, FiGrid, FiPaperclip, FiHeadphones, FiVideo } from 'react-icons/fi';
import { ContentAttribute } from '../api/client';

export const contentAttributes = {
  code: { label: 'Code', Icon: FiCode, hint: 'Contains fenced code blocks' },
  images: { label: 'Images', Icon: FiImage, hint: 'Contains image references; original files may not be available' },
  tables: { label: 'Tables', Icon: FiGrid, hint: 'Contains Markdown tables' },
  files: { label: 'Files', Icon: FiPaperclip, hint: 'Contains file references; original files may not be available' },
  audio: { label: 'Audio', Icon: FiHeadphones, hint: 'Contains audio references; original files may not be available' },
  video: { label: 'Video', Icon: FiVideo, hint: 'Contains video references; original files may not be available' },
};

export default function ContentBadges({ values = [], compact = false, onFilter }: { values?: ContentAttribute[]; compact?: boolean; onFilter: (value: ContentAttribute) => void }) {
  const known = values.filter(value => value in contentAttributes);
  if (!known.length) return null;
  const shown = compact ? known.slice(0, 2) : known;
  return <span className="content-badges">
    {shown.map(value => { const { label, Icon, hint } = contentAttributes[value];
      return <button type="button" className={`content-badge attribute-${value}`} key={value} title={`Filter by ${label}. ${hint}`} aria-label={`Filter by ${label}`} onClick={() => onFilter(value)}><Icon aria-hidden="true" />{label}</button>;
    })}
    {compact && known.length > shown.length && <span className="content-badge" title={known.slice(2).map(value => contentAttributes[value].label).join(', ')} aria-label={known.slice(2).map(value => contentAttributes[value].label).join(', ')}>+{known.length - shown.length}</span>}
  </span>;
}
