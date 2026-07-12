export function isWatchPage(): boolean {
  return location.pathname === '/watch' && new URLSearchParams(location.search).has('v');
}
