export type TranscriptChunk = {
  text: string;
  startTime?: number;
  endTime?: number;
  /** False only while ML recognition is still a provisional hypothesis. */
  final?: boolean;
};

export type TranscriptSession = {
  stop(): void;
};

export type TranscriptSourceOptions = {
  onChunk: (chunk: TranscriptChunk) => void;
  onError?: (error: unknown) => void;
  signal?: AbortSignal;
  onDetach?: () => void;
};

export type TranscriptSource = {
  bind(options: TranscriptSourceOptions): Promise<TranscriptSession>;
};
