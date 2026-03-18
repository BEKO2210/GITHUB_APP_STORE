# GitHub APK Store — Orchestration Document

## Project Goal
Privacy-first, AMOLED static APK discovery site scraping GitHub releases daily.

## Tech Stack
- Astro 4.16.x (static output)
- Tailwind CSS 3.4.x (custom AMOLED theme)
- TypeScript 5.x strict
- Pagefind 1.x (client-side search via astro-pagefind)
- @octokit/rest 21.x (GitHub API)
- tsx 4.x (script runner)
- @astrojs/sitemap 3.2.x (SEO)
- lucide-astro 0.556.x (icons — deprecated, consider @lucide/astro)
- GitHub Actions (scrape + build + deploy)

## Phase Status
- [x] Phase 0 — Foundation
- [x] Phase 1 — Data Layer
- [x] Phase 2 — Scraper
- [x] Phase 3 — Layouts & Base
- [x] Phase 4 — Core Components
- [x] Phase 5 — Pages
- [x] Phase 6 — GitHub Actions
- [x] Phase 7 — QA & Final Check

## Architecture Decisions
- Pure static output with Astro — no SSR needed
- Pagefind for client-side search — zero server dependency
- System fonts only — no external font requests for privacy
- Service worker with network-first for pages, cache-first for assets
- All APK links go to GitHub release pages — never proxy downloads
- CSP meta tag restricts all external connections
- Inline SVG icons instead of importing lucide-astro components for reliability

## Known Issues & Debug Log
- `lucide-astro@^0.3.0` does not exist; resolved to `^0.556.0` (package is deprecated, use `@lucide/astro`)
- `@astrojs/sitemap@3.7.1` crashes with Astro 4.x; downgraded to `@3.2.0`
- Seed data uses realistic but estimated values; run scraper with GITHUB_TOKEN for real data

## Setup Instructions (New Developer)
```bash
git clone <repo-url> && cd GITHUB_APP_STORE
npm install
npm run dev          # start dev server
npm run build        # production build
npm run typecheck    # TypeScript checks
```

## How to Add GITHUB_TOKEN
1. Create a GitHub personal access token at https://github.com/settings/tokens
2. For local development: `export GITHUB_TOKEN=ghp_...`
3. For GitHub Actions: it uses the built-in GITHUB_TOKEN automatically

## Known Limitations
- GitHub API rate limit: 60 req/hr unauthenticated, 5000 req/hr with token
- Private repos are excluded (API only returns public data)
- APK files must be in GitHub Releases (not in repo files)
- Screenshots require fastlane metadata structure in the repo

## Customization
- **Featured apps**: Edit `src/data/featured.json` with app IDs
- **Categories**: Auto-derived from app topics; mapping in `scripts/scrape.ts` CATEGORY_MAP
- **Theme**: Edit colors in `tailwind.config.mjs`

## Completion Checklist
All items verified and passing. See Phase 7 QA output.
