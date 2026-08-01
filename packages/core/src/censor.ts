import type { TranscriptChunk } from './transcript';

export type CensorRange = {
  startTime: number;
  endTime: number;
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

const DEFAULT_RUSSIAN_CENSOR_WORDS = [
  'блядь',
  'блять',
  'ебать',
  'ебаный',
  'ебанутая',
  'ебануть',
  'мудак',
  'пизда',
  'пиздец',
  'пиздёж',
  'сука',
  'хуй',
  'хуя',
  'хуе',
] as const;

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

export function createDefaultRussianCensorLexicon(): CensorLexicon {
  return createCensorLexicon({ literalWords: DEFAULT_RUSSIAN_CENSOR_WORDS });
}

export function createCensorRanges(chunk: TranscriptChunk, lexicon: CensorLexicon): CensorRange[] {
  if (!hasMediaTimelineInterval(chunk)) {
    return [];
  }

  const containsMatch = chunk.text.split(/\s+/u).some((token) => lexicon.matches(token));

  return containsMatch ? [{ startTime: chunk.startTime, endTime: chunk.endTime }] : [];
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
