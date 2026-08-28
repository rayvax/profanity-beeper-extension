export function getVideoIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get('v');
}

export function isWatchPage(): boolean {
  return location.pathname === '/watch' && getVideoIdFromUrl() !== null;
}
