export function getCaptionTextDelta(previous: string, current: string): string {
  if (!previous) {
    return current;
  }
  if (!current) {
    return '';
  }
  if (current.startsWith(previous)) {
    return current.slice(previous.length).trim();
  }

  const maxLen = Math.min(previous.length, current.length);
  for (let len = maxLen; len > 0; len--) {
    const suffix = previous.slice(-len);
    const idx = current.indexOf(suffix);
    if (idx !== -1) {
      return current.slice(idx + len).trim();
    }
  }

  return current;
}
