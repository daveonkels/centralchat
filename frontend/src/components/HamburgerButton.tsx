interface HamburgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

function HamburgerButton({ isOpen, onClick }: HamburgerButtonProps) {
  return (
    <button
      className={`hamburger-btn ${isOpen ? 'open' : ''}`}
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls="mobile-drawer"
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      type="button"
    >
      <span className="hamburger-line" />
      <span className="hamburger-line" />
      <span className="hamburger-line" />
    </button>
  );
}

export default HamburgerButton;
