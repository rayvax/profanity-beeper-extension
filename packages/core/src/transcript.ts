export type TranscriptChunk = {
  text: string;
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
