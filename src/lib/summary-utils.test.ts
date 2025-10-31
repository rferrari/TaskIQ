// src/lib/summary-utils.test.ts
import { calculateSummary } from './summary-utils';
import { AnalyzedIssue } from '@/types';

describe('calculateSummary', () => {
  it('should calculate the summary correctly for a list of issues', () => {
    const issues: AnalyzedIssue[] = [
      {
        id: 1,
        number: 1,
        title: 'Test Issue 1',
        body: 'Test Body 1',
        labels: [],
        state: 'open',
        html_url: '',
        created_at: '',
        comments: 0,
        complexity: 1,
        estimated_cost: '$20-$50',
        category: 'bug',
        confidence: 0.8,
        key_factors: [],
        potential_risks: [],
        recommended_actions: [],
        ai_analysis: '',
      },
      {
        id: 2,
        number: 2,
        title: 'Test Issue 2',
        body: 'Test Body 2',
        labels: [],
        state: 'open',
        html_url: '',
        created_at: '',
        comments: 0,
        complexity: 3,
        estimated_cost: '$120-$300',
        category: 'feature',
        confidence: 0.9,
        key_factors: [],
        potential_risks: [],
        recommended_actions: [],
        ai_analysis: '',
      },
    ];

    const summary = calculateSummary(issues);

    expect(summary.total_issues).toBe(2);
    expect(summary.total_budget_min).toBe(140);
    expect(summary.total_budget_max).toBe(350);
    expect(summary.complexity_distribution).toEqual({ 1: 1, 3: 1 });
    expect(summary.category_breakdown).toEqual({ bug: 1, feature: 1 });
    expect(summary.average_confidence).toBeCloseTo(0.85);
  });

  it('should handle issues with missing or invalid cost', () => {
    const issues: AnalyzedIssue[] = [
      {
        id: 1,
        number: 1,
        title: 'Test Issue 1',
        body: 'Test Body 1',
        labels: [],
        state: 'open',
        html_url: '',
        created_at: '',
        comments: 0,
        complexity: 1,
        estimated_cost: 'invalid-cost',
        category: 'bug',
        confidence: 0.8,
        key_factors: [],
        potential_risks: [],
        recommended_actions: [],
        ai_analysis: '',
      },
    ];

    const summary = calculateSummary(issues);

    expect(summary.total_budget_min).toBe(20);
    expect(summary.total_budget_max).toBe(50);
  });
});
