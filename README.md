# GitHub APK Store

A privacy-first, AMOLED-themed static web application that discovers and indexes Android APK files from GitHub releases. Like Google Play, but open-source, tracking-free, and built for privacy.

## Features

- **Privacy-first**: Zero tracking, zero cookies, zero external requests
- **AMOLED theme**: Pure black (#000000) background for OLED displays
- **PWA support**: Install as a native app with offline support
- **Daily updates**: GitHub Actions scrapes new apps every day
- **Client-side search**: Powered by Pagefind — no server needed
- **Direct downloads**: Links go to official GitHub release pages

## Setup

### Prerequisites

- Node.js 20+
- npm
- A GitHub personal access token (for higher API rate limits)

### Installation

```bash
git clone https://github.com/YOUR-USERNAME/GITHUB_APP_STORE.git
cd GITHUB_APP_STORE
npm install
```

### Development

```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build
npm run typecheck  # Run TypeScript checks
```

### Running the Scraper

```bash
# Set your GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Full scrape
npm run scrape

# Dry run (no files written)
npm run scrape:dry

# Limited scrape (for testing)
npm run scrape -- --limit=5
```

## Deployment

### GitHub Pages

1. Go to **Settings → Pages → Source** and select **GitHub Actions**
2. Add a `GITHUB_TOKEN` secret (Settings → Secrets → Actions) — the default `GITHUB_TOKEN` works for public repos
3. Push to `main` to trigger a build and deploy
4. The daily scrape workflow runs at 6 AM UTC automatically

### Configuration

Update `astro.config.mjs` with your actual GitHub Pages URL:

```javascript
site: 'https://yourusername.github.io',
base: '/your-repo-name',
```

## Submit Your App

Want your Android app listed? Simply add the topic `github-apk-store` to your GitHub repository:

1. Go to your repo on GitHub
2. Click the gear icon next to "About"
3. Add `github-apk-store` to the Topics field
4. Ensure your repo has at least one release with an `.apk` file attached

Your app will be discovered and indexed in the next daily scrape.

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS
- [Pagefind](https://pagefind.app/) — Client-side search
- [Octokit](https://github.com/octokit/rest.js) — GitHub API client
- GitHub Actions — CI/CD and daily scraping

## License

MIT
