import { GitHubIssue } from '@/types';

export function extractRepoInfo(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) return null;
  
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, '')
  };
}

export async function fetchGitHubIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
    {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Issue-Estimator'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const issues = await response.json();
  return issues.filter((issue: any) => !issue.pull_request); // Exclude PRs
}