import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import pagefind from 'astro-pagefind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // TODO: Update 'site' and 'base' to your actual GitHub Pages URL
  // e.g. site: 'https://yourusername.github.io', base: '/your-repo-name'
  site: 'https://BEKO2210.github.io',
  base: '/GITHUB_APP_STORE',
  output: 'static',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    pagefind(),
    sitemap(),
  ],
  build: {
    assets: '_assets',
  },
});
