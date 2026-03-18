import { Octokit } from '@octokit/rest';
import { RateLimiter } from './rate-limiter.js';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error(
    'ERROR: GITHUB_TOKEN environment variable is required.\n' +
    'Create a personal access token at https://github.com/settings/tokens\n' +
    'Then: export GITHUB_TOKEN=ghp_your_token_here'
  );
  process.exit(1);
}

export const octokit = new Octokit({ auth: token });
export const rateLimiter = new RateLimiter();

/** Wrapper around octokit that tracks rate limits. */
export async function ghRequest<T>(
  fn: () => Promise<{ data: T; headers: Record<string, string | undefined> }>
): Promise<T | null> {
  await rateLimiter.waitIfNeeded();

  try {
    const response = await fn();
    // Convert header record to a Headers-like object for the rate limiter
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value) headers.set(key, value);
    }
    rateLimiter.updateFromHeaders(headers);
    rateLimiter.resetErrors();
    return response.data;
  } catch (error: unknown) {
    const status = (error as { status?: number }).status ?? 0;
    if (status === 404) {
      console.log(`[github-api] 404 — resource not found, skipping.`);
      return null;
    }

    const shouldRetry = await rateLimiter.backoff(status);
    if (shouldRetry) {
      return ghRequest(fn);
    }

    console.error(`[github-api] Request failed with status ${status}:`, (error as Error).message);
    return null;
  }
}
