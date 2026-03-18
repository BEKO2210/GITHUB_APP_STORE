const MAX_BACKOFF_MS = 60_000;

export class RateLimiter {
  private remaining = Infinity;
  private resetAt = 0;
  private consecutiveErrors = 0;

  /** Update internal state from GitHub response headers. */
  updateFromHeaders(headers: Headers): void {
    const rem = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (rem !== null) this.remaining = parseInt(rem, 10);
    if (reset !== null) this.resetAt = parseInt(reset, 10);
  }

  /** Wait if rate-limit is nearly exhausted. */
  async waitIfNeeded(): Promise<void> {
    if (this.remaining < 10 && this.resetAt > 0) {
      const waitMs = Math.max(0, this.resetAt * 1000 - Date.now()) + 1000;
      console.log(`[rate-limiter] Remaining=${this.remaining}. Sleeping ${Math.round(waitMs / 1000)}s until reset.`);
      await sleep(waitMs);
      this.remaining = Infinity;
    }
  }

  /** Exponential backoff after a 429/403 response. Returns true if should retry. */
  async backoff(status: number): Promise<boolean> {
    if (status !== 429 && status !== 403) {
      this.consecutiveErrors = 0;
      return false;
    }
    this.consecutiveErrors++;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, this.consecutiveErrors - 1));
    console.log(`[rate-limiter] Got ${status}. Backoff ${delay}ms (attempt ${this.consecutiveErrors}).`);
    await sleep(delay);
    return this.consecutiveErrors <= 6;
  }

  resetErrors(): void {
    this.consecutiveErrors = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
