import { AnalyzedIssue } from '@/types';

export function generateCSV(issues: AnalyzedIssue[]): string {
  const headers = [
    'issue_number',
    'title',
    'complexity', 
    'estimated_cost',
    'labels',
    'url'
  ];

  const rows = issues.map(issue => [
    issue.number,
    `"${escapeCSV(issue.title)}"`,
    issue.complexity,
    `"${issue.estimated_cost}"`,
    `"${issue.labels.map(l => l.name).join(', ')}"`,
    issue.html_url
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function escapeCSV(str: string): string {
  return str.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}