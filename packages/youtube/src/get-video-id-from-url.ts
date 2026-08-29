export function getVideoIdFromUrl(): string | null {
  return new URLSearchParams(location.search).get('v');
}
