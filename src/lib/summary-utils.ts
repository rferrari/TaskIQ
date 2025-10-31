// src/lib/summary-utils.ts
import { AnalyzedIssue } from '@/types';

// Helper function for fallback cost calculation
function getFallbackCost(complexity: number): { min: number; max: number } {
  const costs: Record<number, { min: number; max: number }> = {
    1: { min: 20, max: 50 },
    2: { min: 50, max: 120 },
    3: { min: 120, max: 300 },
    4: { min: 300, max: 600 },
    5: { min: 600, max: 1000 }
  };
  return costs[complexity] || { min: 100, max: 200 };
}

export function calculateSummary(issues: AnalyzedIssue[]) {
  const complexityDistribution: Record<number, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  let totalBudgetMin = 0;
  let totalBudgetMax = 0;

  // Filter out any undefined issues
  const validIssues = issues.filter(issue => issue && typeof issue === 'object');
  
  console.log(`📊 Calculating summary for ${validIssues.length} valid issues (${issues.length - validIssues.length} invalid)`);

  validIssues.forEach(issue => {
    // Ensure we have valid numbers
    const complexity = Number(issue.complexity) || 1;
    const confidence = Number(issue.confidence) || 0.5;
    
    complexityDistribution[complexity] = (complexityDistribution[complexity] || 0) + 1;
    categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
    
    // FIXED: Proper cost parsing with better error handling
    const costMatch = issue.estimated_cost?.match(/\$(\d+)(?:\s*-\s*\$\s*(\d+))?/);
    if (costMatch) {
      const minCost = parseInt(costMatch[1]) || 0;
      const maxCost = costMatch[2] ? parseInt(costMatch[2]) : minCost;
      
      totalBudgetMin += minCost;
      totalBudgetMax += maxCost;
    } else {
      console.warn(`Could not parse cost for issue #${issue.number}: "${issue.estimated_cost}"`);
      // Use fallback cost based on complexity
      const fallbackCost = getFallbackCost(complexity);
      totalBudgetMin += fallbackCost.min;
      totalBudgetMax += fallbackCost.max;
    }
  });

  const averageConfidence = validIssues.length > 0 
    ? validIssues.reduce((sum, issue) => sum + (Number(issue.confidence) || 0), 0) / validIssues.length
    : 0;

  return {
    total_issues: validIssues.length,
    total_budget_min: totalBudgetMin,
    total_budget_max: totalBudgetMax,
    complexity_distribution: complexityDistribution,
    category_breakdown: categoryBreakdown,
    average_confidence: averageConfidence
  };
}
