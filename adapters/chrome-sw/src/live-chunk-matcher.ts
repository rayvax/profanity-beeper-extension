import { ChunkMatcher } from '@beeper/core';

import type { MatchConfigResolver } from './match-config-resolver';

export class LiveChunkMatcher {
  private matcher: ChunkMatcher;
  private readonly resolver: MatchConfigResolver;
  private pendingReload: Promise<void> = Promise.resolve();

  private constructor(resolver: MatchConfigResolver, matcher: ChunkMatcher) {
    this.resolver = resolver;
    this.matcher = matcher;
  }

  static async create(resolver: MatchConfigResolver): Promise<LiveChunkMatcher> {
    return new LiveChunkMatcher(resolver, new ChunkMatcher(await resolver.getConfig()));
  }

  scheduleReload(): void {
    this.pendingReload = this.reload();
  }

  async waitReload(): Promise<void> {
    await this.pendingReload;
  }

  matches(text: string): boolean {
    return this.matcher.matches(text);
  }

  private async reload(): Promise<void> {
    this.matcher = new ChunkMatcher(await this.resolver.getConfig());
  }
}
