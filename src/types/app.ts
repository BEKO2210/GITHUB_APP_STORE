export interface AppEntry {
  id: string;
  name: string;
  author: string;
  authorUrl: string;
  description: string;
  repoUrl: string;
  releaseUrl: string;
  apkUrl: string;
  version: string;
  versionCode: number;
  size: number;
  sizeFormatted: string;
  stars: number;
  forks: number;
  topics: string[];
  category: string;
  license: string | null;
  screenshots: string[];
  icon: string | null;
  lastUpdated: string;
  createdAt: string;
  openIssues: number;
  language: string | null;
  isVerified: boolean;
  isFeatured: boolean;
  addedAt: string;
}

export interface StoreMeta {
  totalApps: number;
  lastUpdated: string;
  totalCategories: number;
  version: string;
}

export interface CategoryEntry {
  slug: string;
  label: string;
  count: number;
  description: string;
}
