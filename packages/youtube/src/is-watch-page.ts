import { getVideoIdFromUrl } from './get-video-id-from-url';

export function isWatchPage(): boolean {
  return location.pathname === '/watch' && getVideoIdFromUrl() !== null;
}
