/** Keep browser/install metadata in sync with the user's selected app theme. */
export function syncBrandTheme(theme: 'light' | 'dark') {
  const base = '/brand/v1';
  const assets: Record<string, string> = {
    'app-favicon': `${base}/icon-${theme}.svg`,
    'app-favicon-fallback': `${base}/favicon-${theme}.ico`,
    'app-touch-icon': `${base}/apple-touch-icon-${theme}.png`,
    'app-manifest': `${base}/site-${theme}.webmanifest`,
  };
  Object.entries(assets).forEach(([id, href]) => {
    document.getElementById(id)?.setAttribute('href', href);
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'dark' ? '#101011' : '#ffffff',
  );
}
