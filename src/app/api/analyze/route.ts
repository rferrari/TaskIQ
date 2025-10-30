import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { analyzeIssueWithAI } from '@/lib/ai-analysis';
import { AnalysisResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { repoUrl } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 });
    }

    // Extract repo info from URL
    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
    }

    // Fetch issues from GitHub
    const issues = await fetchGitHubIssues(repoInfo.owner, repoInfo.repo);
    
    if (issues.length === 0) {
      return NextResponse.json({ error: 'No open issues found in this repository' }, { status: 404 });
    }

    // Analyze each issue with AI
    const analysisPromises = issues.map(async (issue) => {
      const analysis = await analyzeIssueWithAI(issue);
      return {
        ...issue,
        ...analysis
      };
    });

    const analyzedIssues = await Promise.all(analysisPromises);

    // Calculate summary statistics
    const summary = calculateSummary(analyzedIssues);

    const result: AnalysisResult = {
      issues: analyzedIssues,
      summary
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    );
  }
}

function calculateSummary(issues: any[]) {
  const complexityDistribution: Record<number, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  let totalBudgetMin = 0;
  let totalBudgetMax = 0;

  issues.forEach(issue => {
    // Count complexity distribution
    complexityDistribution[issue.complexity] = (complexityDistribution[issue.complexity] || 0) + 1;
    
    // Count category breakdown
    categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
    
    // Calculate total budget range
    const costMatch = issue.estimated_cost.match(/\$(\d+)-?\$?(\d+)?/);
    if (costMatch) {
      totalBudgetMin += parseInt(costMatch[1]);
      totalBudgetMax += parseInt(costMatch[2] || costMatch[1]);
    }
  });

  return {
    total_issues: issues.length,
    total_budget_min: totalBudgetMin,
    total_budget_max: totalBudgetMax,
    complexity_distribution: complexityDistribution,
    category_breakdown: categoryBreakdown,
    average_confidence: issues.reduce((sum, issue) => sum + issue.confidence, 0) / issues.length
  };
}