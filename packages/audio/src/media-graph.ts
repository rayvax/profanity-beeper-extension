export type SharedMediaGraph = {
  media: HTMLMediaElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  delay: DelayNode;
  gain: GainNode;
};

const MAX_DELAY_SECONDS = 5;
const graphs = new WeakMap<HTMLMediaElement, Promise<SharedMediaGraph>>();

/**
 * Routes a media element through a shared `source → delay → gain → destination`
 * chain. An HTMLMediaElement accepts only one MediaElementSourceNode for its
 * whole lifetime, so every censor mode must reuse the same chain: the delay
 * stays at 0 for immediate playback and the gain stays at 1 while idle.
 * Contexts are intentionally never closed — closing would not release the
 * media element binding anyway.
 */
export function acquireMediaGraph(media: HTMLMediaElement): Promise<SharedMediaGraph> {
  const existing = graphs.get(media);
  if (existing) return existing;

  const promise = (async () => {
    const context = new AudioContext();
    await context.resume();
    if (context.state !== 'running') {
      // Routing media audio through a suspended context would silence playback.
      await context.close().catch(() => undefined);
      throw new Error('AudioContext is blocked until a user gesture');
    }
    const source = context.createMediaElementSource(media);
    const delay = context.createDelay(MAX_DELAY_SECONDS);
    const gain = context.createGain();
    source.connect(delay);
    delay.connect(gain);
    gain.connect(context.destination);
    return { media, context, source, delay, gain };
  })();

  graphs.set(media, promise);
  promise.catch(() => graphs.delete(media));
  return promise;
}
