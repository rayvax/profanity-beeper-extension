export type SpeechWord = {
  text: string;
  startTime: number;
  endTime: number;
};

export type SpeechRecognitionResult = {
  final: boolean;
  words: SpeechWord[];
};

export type SpeechRecognitionSession = {
  stop(): void;
};

export type SpeechRecognitionOptions = {
  media: HTMLMediaElement;
  signal?: AbortSignal;
  onResult(result: SpeechRecognitionResult): void;
  onError(error: unknown): void;
};

export type SpeechRecognizer = {
  preload(signal?: AbortSignal): Promise<void>;
  recognize(options: SpeechRecognitionOptions): Promise<SpeechRecognitionSession>;
};
