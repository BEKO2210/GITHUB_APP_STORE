import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { octokit, ghRequest } from './utils/github-api.js';
import { slugify } from './utils/slug.js';
import type { AppEntry, StoreMeta, CategoryEntry } from '../src/types/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');
const APPS_FILE = join(DATA_DIR, 'apps.json');
const META_FILE = join(DATA_DIR, 'meta.json');
const CATS_FILE = join(DATA_DIR, 'categories.json');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const CATEGORY_MAP: Record<string, { label: string; description: string }> = {
  media: { label: 'Media', description: 'Media players, music, and video apps' },
  communication: { label: 'Communication', description: 'Messaging, email, and social apps' },
  navigation: { label: 'Navigation', description: 'Maps and navigation apps' },
  security: { label: 'Security', description: 'Password managers and security tools' },
  weather: { label: 'Weather', description: 'Weather forecast apps' },
  tools: { label: 'Tools', description: 'Utility and productivity apps' },
  development: { label: 'Development', description: 'Developer tools and IDEs' },
  games: { label: 'Games', description: 'Games and entertainment' },
  health: { label: 'Health', description: 'Health and fitness apps' },
  education: { label: 'Education', description: 'Learning and education apps' },
  finance: { label: 'Finance', description: 'Finance and budgeting apps' },
  customization: { label: 'Customization', description: 'Launchers, themes, and customization' },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseVersionCode(tag: string): number {
  const digits = tag.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits.slice(0, 10), 10) : 0;
}

function guessCategory(topics: string[]): string {
  for (const topic of topics) {
    const normalized = topic.toLowerCase();
    if (CATEGORY_MAP[normalized]) return normalized;
    if (['music', 'video', 'audio', 'player', 'podcast', 'streaming'].includes(normalized)) return 'media';
    if (['email', 'chat', 'messenger', 'social'].includes(normalized)) return 'communication';
    if (['maps', 'gps', 'location'].includes(normalized)) return 'navigation';
    if (['password', 'encryption', 'privacy', 'vpn'].includes(normalized)) return 'security';
    if (['launcher', 'theme', 'icon-pack'].includes(normalized)) return 'customization';
    if (['todo', 'notes', 'utility', 'file-manager'].includes(normalized)) return 'tools';
  }
  return 'tools';
}

async function fetchIconUrl(owner: string, repo: string): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/fastlane/metadata/android/en-US/images/icon.png`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

async function buildAppEntry(owner: string, repo: string, categoryOverride?: string): Promise<AppEntry | null> {
  // Fetch repo info
  const repoData = await ghRequest(() => octokit.repos.get({ owner, repo }));
  if (!repoData) return null;

  // Fetch latest release
  const release = await ghRequest(() => octokit.repos.getLatestRelease({ owner, repo }));
  if (!release) {
    console.log(`  [skip] No releases for ${owner}/${repo}`);
    return null;
  }

  // Find first APK asset
  const apkAsset = release.assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
  if (!apkAsset) {
    console.log(`  [skip] No APK asset in latest release of ${owner}/${repo}`);
    return null;
  }

  const topics = repoData.topics ?? [];
  const icon = await fetchIconUrl(owner, repo);

  return {
    id: slugify(owner, repo),
    name: repoData.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    author: owner,
    authorUrl: `https://github.com/${owner}`,
    description: (repoData.description ?? '').slice(0, 200),
    repoUrl: repoData.html_url,
    releaseUrl: release.html_url,
    apkUrl: apkAsset.browser_download_url,
    version: release.tag_name,
    versionCode: parseVersionCode(release.tag_name),
    size: apkAsset.size,
    sizeFormatted: formatSize(apkAsset.size),
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    topics,
    category: categoryOverride ?? guessCategory(topics),
    license: repoData.license?.spdx_id ?? null,
    screenshots: [],
    icon,
    lastUpdated: release.published_at ?? repoData.updated_at,
    createdAt: repoData.created_at,
    openIssues: repoData.open_issues_count,
    language: repoData.language ?? null,
    isVerified: topics.includes('github-apk-store'),
    isFeatured: false,
    addedAt: new Date().toISOString(),
  };
}

async function discoverRepos(): Promise<Array<{ owner: string; repo: string }>> {
  const repos: Array<{ owner: string; repo: string }> = [];
  const seen = new Set<string>();

  // Search by topic
  console.log('[scrape] Searching for repos with topic "github-apk-store"...');
  const topicResults = await ghRequest(() =>
    octokit.search.repos({ q: 'topic:github-apk-store', per_page: 100, sort: 'stars' })
  );
  if (topicResults) {
    for (const r of topicResults.items) {
      const key = `${r.owner.login}/${r.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        repos.push({ owner: r.owner.login, repo: r.name });
      }
    }
  }

  // Search for APK files in releases
  console.log('[scrape] Searching for repos with APK releases...');
  const codeResults = await ghRequest(() =>
    octokit.search.repos({ q: 'android apk in:readme language:Java language:Kotlin', per_page: 100, sort: 'stars' })
  );
  if (codeResults) {
    for (const r of codeResults.items) {
      const key = `${r.owner.login}/${r.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        repos.push({ owner: r.owner.login, repo: r.name });
      }
    }
  }

  return repos;
}

async function main(): Promise<void> {
  console.log(`[scrape] Starting${isDryRun ? ' (DRY RUN)' : ''}${limit < Infinity ? ` (limit: ${limit})` : ''}...`);

  // Load existing data
  let existingApps: AppEntry[] = [];
  if (existsSync(APPS_FILE)) {
    existingApps = JSON.parse(readFileSync(APPS_FILE, 'utf-8'));
    console.log(`[scrape] Loaded ${existingApps.length} existing apps.`);
  }
  const existingMap = new Map(existingApps.map((a) => [a.id, a]));

  // Discover repos
  const candidates = await discoverRepos();
  const toProcess = candidates.slice(0, limit);
  console.log(`[scrape] Found ${candidates.length} candidates, processing ${toProcess.length}.`);

  let newCount = 0;
  let updatedCount = 0;

  for (const { owner, repo } of toProcess) {
    console.log(`[scrape] Processing ${owner}/${repo}...`);
    const entry = await buildAppEntry(owner, repo);
    if (!entry) continue;

    const existing = existingMap.get(entry.id);
    if (existing) {
      // Preserve addedAt from existing entry
      entry.addedAt = existing.addedAt;
      entry.isFeatured = existing.isFeatured;
      updatedCount++;
    } else {
      newCount++;
    }
    existingMap.set(entry.id, entry);
  }

  // Build final arrays
  const allApps = Array.from(existingMap.values()).sort((a, b) => b.stars - a.stars);

  // Build categories
  const catCounts = new Map<string, number>();
  for (const app of allApps) {
    catCounts.set(app.category, (catCounts.get(app.category) ?? 0) + 1);
  }
  const categories: CategoryEntry[] = Array.from(catCounts.entries())
    .map(([slug, count]) => ({
      slug,
      label: CATEGORY_MAP[slug]?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1),
      count,
      description: CATEGORY_MAP[slug]?.description ?? `Apps in the ${slug} category`,
    }))
    .sort((a, b) => b.count - a.count);

  const meta: StoreMeta = {
    totalApps: allApps.length,
    lastUpdated: new Date().toISOString(),
    totalCategories: categories.length,
    version: '1',
  };

  // Output
  console.log(`\n[scrape] Summary: ${newCount} new, ${updatedCount} updated, ${allApps.length} total.`);

  if (isDryRun) {
    console.log('[scrape] DRY RUN — no files written.');
    console.log(`[scrape] Would write ${allApps.length} apps, ${categories.length} categories.`);
  } else {
    writeFileSync(APPS_FILE, JSON.stringify(allApps, null, 2));
    writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
    writeFileSync(CATS_FILE, JSON.stringify(categories, null, 2));
    console.log('[scrape] Data files written successfully.');
  }
}

main().catch((err) => {
  console.error('[scrape] Fatal error:', err);
  process.exit(1);
});
