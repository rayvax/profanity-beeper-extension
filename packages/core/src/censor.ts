import { normaliseCensorToken, type ChunkMatcher } from './chunk-matcher';
import type { TranscriptChunk } from './transcript';

export type CensorRange = {
  startTime: number;
  endTime: number;
  /** False only while ML recognition is still a provisional word estimate. */
  final?: boolean;
  /** Normalised ML token used to replace its provisional range with final timing. */
  token?: string;
};

export type CensorExecutor = {
  readonly activation: CensorActivation;
  execute(range: CensorRange): void | Promise<void>;
  onError(listener: (error: unknown) => void): () => void;
  stop(): void;
};

export type CensorActivation =
  | { readonly kind: 'on-execute' }
  | { readonly kind: 'on-interaction'; arm(): void | Promise<void> };

export function createCensorRanges(chunk: TranscriptChunk, matcher: ChunkMatcher): CensorRange[] {
  if (!hasMediaTimelineInterval(chunk)) {
    return [];
  }

  if (!matcher.matches(chunk.text)) return [];

  const range: CensorRange = { startTime: chunk.startTime, endTime: chunk.endTime };
  if (chunk.final !== undefined) {
    range.final = chunk.final;
    range.token = normaliseCensorToken(chunk.text);
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
