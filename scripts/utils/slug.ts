/**
 * Convert an owner/repo pair into a URL-safe slug.
 * Example: "TeamNewPipe/NewPipe" → "teamnewpipe-newpipe"
 */
export function slugify(owner: string, repo: string): string {
  return `${owner}-${repo}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
