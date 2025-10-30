import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { analyzeIssueWithAI, mockAnalyzeIssue } from '@/lib/ai-service';
import { AnalysisResult } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { repoUrl } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 });
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
    }

    console.log(`🔍 Fetching issues from ${repoInfo.owner}/${repoInfo.repo}`);
    const issues = await fetchGitHubIssues(repoInfo.owner, repoInfo.repo);
    
    if (issues.length === 0) {
      return NextResponse.json({ error: 'No open issues found in this repository' }, { status: 404 });
    }

    console.log(`📊 Analyzing ${issues.length} issues...`);
    
    // Use mock analysis if no API key is configured
    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

    // Analyze issues
    const analysisPromises = issues.map(async (issue, index) => {
      // Add small delay to avoid rate limits
      if (index > 0 && !shouldUseMock) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      const analysis = shouldUseMock 
        ? mockAnalyzeIssue(issue)
        : await analyzeIssueWithAI(issue);
      
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

    console.log(`✅ Analysis complete for ${repoInfo.owner}/${repoInfo.repo}`);
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
    complexityDistribution[issue.complexity] = (complexityDistribution[issue.complexity] || 0) + 1;
    categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
    
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