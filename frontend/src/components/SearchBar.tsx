import { useState, useEffect } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
}

function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, 300);

    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div className="search-container">
      <input
        type="text"
        className="search-input"
        placeholder="Search across all your chats..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
    </div>
  );
}

export default SearchBar;
