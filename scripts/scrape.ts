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
  browser: { label: 'Browser', description: 'Web browsers and related apps' },
  reading: { label: 'Reading', description: 'E-book readers, RSS, and news apps' },
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

function guessCategory(topics: string[], repoName: string, description: string): string {
  const all = [...topics.map((t) => t.toLowerCase()), repoName.toLowerCase(), description.toLowerCase()];
  const text = all.join(' ');

  // Check topics first
  for (const topic of topics) {
    const normalized = topic.toLowerCase();
    if (CATEGORY_MAP[normalized]) return normalized;
    if (['music', 'video', 'audio', 'player', 'podcast', 'streaming', 'youtube', 'media-player'].includes(normalized)) return 'media';
    if (['email', 'chat', 'messenger', 'social', 'mastodon', 'matrix', 'xmpp', 'irc', 'fediverse', 'messaging'].includes(normalized)) return 'communication';
    if (['maps', 'gps', 'location', 'navigation', 'openstreetmap', 'osm'].includes(normalized)) return 'navigation';
    if (['password', 'encryption', 'privacy', 'vpn', 'firewall', 'authenticator', '2fa', 'totp', 'password-manager'].includes(normalized)) return 'security';
    if (['launcher', 'theme', 'icon-pack', 'wallpaper', 'customization', 'widget'].includes(normalized)) return 'customization';
    if (['todo', 'notes', 'utility', 'file-manager', 'keyboard', 'calculator', 'clock', 'calendar', 'terminal'].includes(normalized)) return 'tools';
    if (['game', 'gaming', 'emulator', 'minecraft', 'rpg'].includes(normalized)) return 'games';
    if (['browser', 'web-browser'].includes(normalized)) return 'browser';
    if (['rss', 'reader', 'ebook', 'news', 'feed'].includes(normalized)) return 'reading';
    if (['fitness', 'health', 'workout', 'exercise', 'step-counter'].includes(normalized)) return 'health';
    if (['finance', 'budget', 'money', 'crypto', 'wallet', 'banking'].includes(normalized)) return 'finance';
    if (['education', 'learning', 'flashcard', 'study'].includes(normalized)) return 'education';
    if (['developer', 'ide', 'code-editor', 'terminal', 'git'].includes(normalized)) return 'development';
  }

  // Fallback: check description and repo name
  if (/\b(music|video|media|player|audio|podcast|stream)\b/.test(text)) return 'media';
  if (/\b(messag|chat|email|mail|social|telegram|signal|matrix)\b/.test(text)) return 'communication';
  if (/\b(map|navigation|gps|route)\b/.test(text)) return 'navigation';
  if (/\b(password|encrypt|security|vpn|authenticat|2fa)\b/.test(text)) return 'security';
  if (/\b(browser|web browser)\b/.test(text)) return 'browser';
  if (/\b(rss|reader|ebook|e-book|news|feed)\b/.test(text)) return 'reading';
  if (/\b(game|gaming|emulat)\b/.test(text)) return 'games';
  if (/\b(launcher|theme|wallpaper|icon.?pack|widget)\b/.test(text)) return 'customization';
  if (/\b(weather|forecast|temperature)\b/.test(text)) return 'weather';
  if (/\b(finance|budget|money|bank|crypto|wallet)\b/.test(text)) return 'finance';
  if (/\b(health|fitness|workout|exercise)\b/.test(text)) return 'health';
  if (/\b(learn|education|flashcard|study|anki)\b/.test(text)) return 'education';

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

  // Find first APK asset (prefer universal/arm64 APK)
  const apkAssets = release.assets.filter((a) => a.name.toLowerCase().endsWith('.apk'));
  if (apkAssets.length === 0) {
    console.log(`  [skip] No APK asset in latest release of ${owner}/${repo}`);
    return null;
  }
  // Prefer: universal > arm64 > first APK
  const apkAsset =
    apkAssets.find((a) => /universal/i.test(a.name)) ??
    apkAssets.find((a) => /arm64/i.test(a.name)) ??
    apkAssets[0];

  const topics = repoData.topics ?? [];
  const icon = await fetchIconUrl(owner, repo);
  const description = (repoData.description ?? '').slice(0, 200);

  return {
    id: slugify(owner, repo),
    name: repoData.name.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    author: owner,
    authorUrl: `https://github.com/${owner}`,
    description,
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
    category: categoryOverride ?? guessCategory(topics, repoData.name, description),
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

/** Paginated search — fetches up to maxPages pages of results for a query. */
async function searchReposPaginated(
  q: string,
  maxPages: number = 3,
  sort: 'stars' | 'updated' = 'stars',
): Promise<Array<{ owner: string; repo: string }>> {
  const results: Array<{ owner: string; repo: string }> = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await ghRequest(() =>
      octokit.search.repos({ q, per_page: 100, sort, page })
    );
    if (!data || data.items.length === 0) break;
    for (const r of data.items) {
      results.push({ owner: r.owner.login, repo: r.name });
    }
    if (data.items.length < 100) break; // last page
  }
  return results;
}

async function discoverRepos(): Promise<Array<{ owner: string; repo: string }>> {
  const seen = new Set<string>();
  const repos: Array<{ owner: string; repo: string }> = [];

  function addRepo(owner: string, repo: string): void {
    const key = `${owner}/${repo}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      repos.push({ owner, repo });
    }
  }

  // ── 1. Curated list of well-known open-source Android apps ──
  console.log('[scrape] Adding curated list of known open-source Android apps...');
  const CURATED: Array<[string, string]> = [
    // Media & Video
    ['TeamNewPipe', 'NewPipe'],
    ['libre-tube', 'LibreTube'],
    ['vfsfitvnm', 'ViMusic'],
    ['fast4x', 'RiMusic'],
    ['RetroMusicPlayer', 'RetroMusicPlayer'],
    ['enricocid', 'Music-Player-GO'],
    ['y20k', 'transistor'],
    ['AdrienPoupa', 'VinylMusicPlayer'],
    ['maxrave-dev', 'SimpMusic'],
    ['z-huang', 'InnerTune'],
    ['mpv-android', 'mpv-android'],
    ['videolan', 'vlc-android'],
    ['timusus', 'Shuttle'],
    ['MuntashirAkon', 'Metro'],
    ['AntennaPod', 'AntennaPod'],
    ['yausername', 'NewPipeFork'],

    // Communication & Social
    ['signalapp', 'Signal-Android'],
    ['thunderbird', 'thunderbird-android'],
    ['tuskyapp', 'Tusky'],
    ['sk22', 'megalodon'],
    ['jitsi', 'jitsi-meet'],
    ['nicegram', 'Nicegram-Android'],
    ['vector-im', 'element-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],

    // Navigation & Maps
    ['organicmaps', 'organicmaps'],
    ['osmandapp', 'OsmAnd'],

    // Security & Privacy
    ['Kunzisoft', 'KeePassDX'],
    ['beemdevelopment', 'Aegis'],
    ['bitwarden', 'android'],
    ['ProtonVPN', 'android-app'],
    ['M66B', 'NetGuard'],
    ['celzero', 'rethink-app'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],

    // Weather
    ['breezy-weather', 'breezy-weather'],

    // Tools & Utilities
    ['topjohnwu', 'Magisk'],
    ['termux', 'termux-app'],
    ['zhanghai', 'MaterialFiles'],
    ['florisboard', 'florisboard'],
    ['SimpleMobileTools', 'Simple-Calendar'],
    ['SimpleMobileTools', 'Simple-Gallery'],
    ['SimpleMobileTools', 'Simple-File-Manager'],
    ['SimpleMobileTools', 'Simple-Contacts'],
    ['SimpleMobileTools', 'Simple-Notes'],
    ['SimpleMobileTools', 'Simple-Calculator'],
    ['SimpleMobileTools', 'Simple-Clock'],
    ['SimpleMobileTools', 'Simple-Camera'],
    ['SimpleMobileTools', 'Simple-Flashlight'],
    ['SimpleMobileTools', 'Simple-Draw'],
    ['SimpleMobileTools', 'Simple-Music-Player'],
    ['SimpleMobileTools', 'Simple-SMS-Messenger'],
    ['SimpleMobileTools', 'Simple-Dialer'],
    ['SimpleMobileTools', 'Simple-Launcher'],
    ['SimpleMobileTools', 'Simple-Keyboard'],
    ['SimpleMobileTools', 'Simple-App-Launcher'],
    ['SimpleMobileTools', 'Simple-Voice-Recorder'],
    ['tiann', 'KernelSU'],
    ['ankidroid', 'Anki-Android'],
    ['bmax121', 'APatch'],
    ['Nain57', 'Smart-AutoClicker'],
    ['pppscn', 'SmsForwarder'],
    ['JunkFood02', 'Seal'],
    ['T8RIN', 'ImageToolbox'],
    ['iSoron', 'uhabits'],
    ['Ackites', 'Nrfr'],
    ['guardianproject', 'haven'],
    ['LSPosed', 'LSPatch'],
    ['ZCShou', 'GoGoGo'],
    ['alipay', 'SoloPi'],
    ['syncthing', 'syncthing-android'],
    ['NeoApplications', 'Neo-Store'],
    ['gkd-kit', 'gkd'],
    ['localsend', 'localsend'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['FossifyOrg', 'Calendar'],
    ['FossifyOrg', 'Gallery'],
    ['FossifyOrg', 'File-Manager'],
    ['FossifyOrg', 'Contacts'],
    ['FossifyOrg', 'Notes'],
    ['FossifyOrg', 'Phone'],
    ['FossifyOrg', 'SMS-Messenger'],
    ['FossifyOrg', 'Clock'],
    ['FossifyOrg', 'Calculator'],
    ['FossifyOrg', 'Keyboard'],
    ['FossifyOrg', 'Voice-Recorder'],
    ['FossifyOrg', 'Music-Player'],
    ['FossifyOrg', 'Camera'],
    ['FossifyOrg', 'Draw'],
    ['FossifyOrg', 'Flashlight'],
    ['FossifyOrg', 'App-Launcher'],
    ['FossifyOrg', 'Launcher'],
    ['you-apps', 'ClockYou'],
    ['you-apps', 'CalcYou'],
    ['you-apps', 'RecordYou'],
    ['you-apps', 'ConnectYou'],
    ['you-apps', 'TranslateYou'],
    ['Automattic', 'pocket-casts-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],

    // Games
    ['yairm210', 'Unciv'],
    ['PojavLauncherTeam', 'PojavLauncher'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],

    // Reading & RSS
    ['ReadYouApp', 'ReadYou'],
    ['koreader', 'koreader'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],

    // Browsers
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['mozilla-mobile', 'fenix'],

    // Customization
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
    ['nicegram', 'nicegram-android'],
  ];
  for (const [owner, repo] of CURATED) addRepo(owner, repo);

  // ── 2. Search by F-Droid / FOSS topics (high quality) ──
  const topicQueries = [
    'topic:github-apk-store',
    'topic:android-app topic:open-source',
    'topic:f-droid',
    'topic:foss-android',
    'topic:android-application stars:>100',
    'topic:open-source-android',
    'topic:android-app stars:>500',
    'topic:material-design topic:android stars:>200',
    'topic:fdroid',
    'topic:android topic:apk',
  ];
  for (const q of topicQueries) {
    console.log(`[scrape] Searching: ${q}`);
    const results = await searchReposPaginated(q, 3);
    for (const r of results) addRepo(r.owner, r.repo);
  }

  // ── 3. Search by keywords with pagination ──
  const keywordQueries = [
    // Broad APK searches split by language to maximize unique results
    'android apk in:readme language:Kotlin stars:>200',
    'android apk in:readme language:Java stars:>200',
    'android app release apk language:Kotlin stars:>500',
    'android app release apk language:Java stars:>500',
    'open source android app language:Kotlin stars:>300',
    'open source android app language:Java stars:>300',
    // F-Droid apps
    'fdroid android language:Kotlin stars:>100',
    'fdroid android language:Java stars:>100',
    'foss android app language:Kotlin stars:>50',
    'foss android app language:Java stars:>50',
    // Category-specific searches
    'android music player language:Kotlin stars:>100',
    'android file manager language:Kotlin stars:>100',
    'android launcher open source stars:>200',
    'android keyboard open source stars:>100',
    'android browser open source stars:>200',
    'android gallery open source stars:>100',
    'android notes app open source stars:>100',
    'android weather app open source stars:>50',
    'android rss reader stars:>100',
    'android epub reader stars:>100',
    'android password manager open source stars:>100',
    'android vpn open source stars:>100',
    'android camera open source stars:>50',
    'android calculator open source stars:>50',
    'android messenger open source stars:>200',
    'android emulator open source stars:>200',
    'android game open source language:Java stars:>500',
    'android game open source language:Kotlin stars:>200',
    // Recently active
    'android open source app stars:>100 language:Kotlin pushed:>2024-01-01',
    'android open source app stars:>100 language:Java pushed:>2024-01-01',
    'android app apk language:Kotlin pushed:>2024-06-01 stars:>50',
    'android app apk language:Java pushed:>2024-06-01 stars:>50',
    // Material design / modern apps
    'material-design android app language:Kotlin stars:>200',
    'material3 android stars:>50',
    'jetpack-compose android app stars:>100',
    // Root / system tools
    'android root tool apk stars:>100',
    'magisk module android stars:>200',
    'xposed android stars:>200',
  ];
  for (const q of keywordQueries) {
    console.log(`[scrape] Searching: ${q}`);
    const results = await searchReposPaginated(q, 3);
    for (const r of results) addRepo(r.owner, r.repo);
  }

  console.log(`[scrape] Total unique candidates: ${repos.length}`);
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
