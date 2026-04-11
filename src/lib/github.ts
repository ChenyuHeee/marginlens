/**
 * GitHub sync via Personal Access Token + Contents API.
 * Works entirely in the browser — no backend needed.
 */

export interface GitHubConfig {
  token: string;
  owner: string;  // repo owner (user or org)
  repo: string;   // repo name
  branch: string; // target branch, e.g. 'main'
  path: string;   // directory path in repo, e.g. 'notes' or 'docs/reading'
}

interface GitHubContentResponse {
  sha: string;
  content?: string;
}

const API = 'https://api.github.com';

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/** Validate the token and return the authenticated username */
export async function validateToken(token: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error('Token 无效或已过期');
  const data = await res.json();
  return data.login as string;
}

/** List repos that the token can push to */
export async function listRepos(token: string): Promise<{ full_name: string; default_branch: string }[]> {
  const repos: { full_name: string; default_branch: string }[] = [];
  let page = 1;
  // Fetch up to 3 pages (300 repos)
  while (page <= 3) {
    const res = await fetch(
      `${API}/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`,
      { headers: headers(token) },
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!data.length) break;
    for (const r of data) {
      if (r.permissions?.push) {
        repos.push({ full_name: r.full_name, default_branch: r.default_branch });
      }
    }
    page++;
  }
  return repos;
}

/** Get the SHA of an existing file (needed for updates) */
async function getFileSha(
  config: GitHubConfig,
  filePath: string,
): Promise<string | null> {
  const url = `${API}/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${config.branch}`;
  const res = await fetch(url, { headers: headers(config.token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`获取文件信息失败: ${res.status}`);
  const data: GitHubContentResponse = await res.json();
  return data.sha;
}

/** Push (create or update) a single file to the repo */
export async function pushFile(
  config: GitHubConfig,
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const filePath = config.path ? `${config.path}/${filename}` : filename;
  const sha = await getFileSha(config, filePath);
  const url = `${API}/repos/${config.owner}/${config.repo}/contents/${filePath}`;

  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))), // UTF-8 safe base64
    branch: config.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(config.token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `同步失败: ${res.status}`);
  }
}

/** Sanitize a document title into a valid filename */
export function toFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 200) + '.md';
}
