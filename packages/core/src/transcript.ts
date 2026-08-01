export type TranscriptChunk = {
  text: string;
  startTime?: number;
  endTime?: number;
};

export type TranscriptSession = {
  stop(): void;
};

export type TranscriptSourceOptions = {
  onChunk: (chunk: TranscriptChunk) => void;
  signal?: AbortSignal;
  onDetach?: () => void;
};

export type TranscriptSource = {
  bind(options: TranscriptSourceOptions): Promise<TranscriptSession>;
};
