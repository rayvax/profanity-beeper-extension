import type { TranscriptChunk } from './transcript';

export type CensorRange = {
  startTime: number;
  endTime: number;
  /** False only while ML recognition is still a provisional word estimate. */
  final?: boolean;
  /** Normalised ML token used to replace a provisional range once it is final. */
  token?: string;
};

export type CensorExecutor = {
  execute(range: CensorRange): void | Promise<void>;
  stop?(): void;
};

export type CensorLexicon = {
  matches(token: string): boolean;
};

export type CensorLexiconOptions = {
  literalWords?: Iterable<string>;
  patterns?: Iterable<RegExp>;
  whitelist?: Iterable<string>;
};

export function normaliseCensorToken(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/^\p{P}+|\p{P}+$/gu, '');
}

export function createCensorLexicon(options: CensorLexiconOptions = {}): CensorLexicon {
  const literalWords = new Set(
    [...(options.literalWords ?? [])].map(normaliseCensorToken).filter(Boolean),
  );
  const whitelist = new Set(
    [...(options.whitelist ?? [])].map(normaliseCensorToken).filter(Boolean),
  );
  const patterns = [...(options.patterns ?? [])];

  return {
    matches(value) {
      const token = normaliseCensorToken(value);

      if (!token || whitelist.has(token)) {
        return false;
      }

      return (
        literalWords.has(token) ||
        patterns.some((pattern) => {
          pattern.lastIndex = 0;
          const matches = pattern.test(token);
          pattern.lastIndex = 0;
          return matches;
        })
      );
    },
  };
}

export function createCensorRanges(chunk: TranscriptChunk, lexicon: CensorLexicon): CensorRange[] {
  if (!hasMediaTimelineInterval(chunk)) {
    return [];
  }

  const matchedToken = chunk.text.split(/\s+/u).find((token) => lexicon.matches(token));
  if (!matchedToken) return [];

  const range: CensorRange = { startTime: chunk.startTime, endTime: chunk.endTime };
  if (chunk.final !== undefined) {
    range.final = chunk.final;
    range.token = normaliseCensorToken(matchedToken);
  }
  return [range];
}

function hasMediaTimelineInterval(
  chunk: TranscriptChunk,
): chunk is TranscriptChunk & Required<Pick<TranscriptChunk, 'startTime' | 'endTime'>> {
  return (
    Number.isFinite(chunk.startTime) &&
    Number.isFinite(chunk.endTime) &&
    chunk.startTime !== undefined &&
    chunk.endTime !== undefined &&
    chunk.endTime > chunk.startTime
  );
}
