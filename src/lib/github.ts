import {
  featuredRepos,
  repoNameFromFullName,
  type FeaturedRepo,
  type FeaturedRepoConfig,
} from '../apps/featuredRepos';

export type Repo = {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  fork: boolean;
  archived: boolean;
  private?: boolean;
  topics?: string[];
};

export async function fetchAllRepos(username: string): Promise<Repo[]> {
  const url = `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`;
  const headers: Record<string, string> = {
    'User-Agent': 'cortech.online-portfolio',
    Accept: 'application/vnd.github+json',
  };
  // Server-only: process.env is never bundled to the client, and this module
  // is imported only by prerendered routes that run at build time.
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // Security: Add timeout to prevent DoS via hung network requests
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} for ${url}` +
        (token ? '' : ' — set GITHUB_TOKEN to lift the unauthenticated 60/hr rate limit'),
    );
  }
  const all = (await res.json()) as Repo[];
  // /users/{username}/repos returns only public repos, but filter explicitly
  // so a future endpoint or token-scope change can't accidentally leak private.
  return all.filter((r) => !r.private);
}

export async function fetchOriginalRepos(username: string): Promise<Repo[]> {
  const all = await fetchAllRepos(username);
  return all.filter((r) => !r.fork && !r.archived);
}

export function buildFeaturedRepos(
  repos: Repo[],
  configs: FeaturedRepoConfig[] = featuredRepos,
): FeaturedRepo[] {
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const out: FeaturedRepo[] = [];

  for (const cfg of configs) {
    const shortName = repoNameFromFullName(cfg.fullName);
    const repo = byName.get(shortName.toLowerCase());

    if (repo) {
      out.push({
        fullName: cfg.fullName,
        name: repo.name,
        icon: cfg.icon,
        description: repo.description,
        htmlUrl: repo.html_url,
        homepage: repo.homepage && repo.homepage.trim() ? repo.homepage : null,
        language: repo.language,
        stargazersCount: repo.stargazers_count,
        updatedAt: repo.updated_at,
        fork: repo.fork,
        archived: repo.archived,
        private: false,
      });
      continue;
    }

    if (cfg.manual) {
      out.push({
        fullName: cfg.fullName,
        name: shortName,
        icon: cfg.icon,
        description: cfg.manual.description,
        htmlUrl: cfg.manual.htmlUrl,
        homepage: cfg.manual.homepage ?? null,
        language: cfg.manual.language ?? null,
        stargazersCount: 0,
        updatedAt: null,
        fork: false,
        archived: false,
        private: true,
      });
    }
  }

  return out;
}
