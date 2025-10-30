// lib/csv-generator.ts
import { AnalyzedIssue } from '@/types';

export function generateCSV(
  issues: AnalyzedIssue[],
  options?: { includeReasoning?: boolean }
): string {
  const { includeReasoning = false } = options || {};

  const headers = [
    'issue_number',
    'title',
    'complexity', 
    'estimated_cost',
    'labels',
    'url',
    ...(includeReasoning ? ['ai_analysis', 'key_factors', 'potential_risks', 'recommended_actions'] : [])
  ];

  const rows = issues.map(issue => [
    issue.number,
    `"${escapeCSV(issue.title)}"`,
    issue.complexity,
    `"${issue.estimated_cost}"`,
    `"${issue.labels.map(l => l.name).join(', ')}"`,
    issue.html_url,
    ...(includeReasoning
      ? [
          `"${escapeCSV(issue.ai_analysis || '')}"`,
          `"${escapeCSV(issue.key_factors?.join('; ') || '')}"`,
          `"${escapeCSV(issue.potential_risks?.join('; ') || '')}"`,
          `"${escapeCSV(issue.recommended_actions?.join('; ') || '')}"`
        ]
      : [])
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
