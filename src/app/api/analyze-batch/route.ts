// src/app/api/analyze-batch/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const preferredRegion = 'auto';

import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { analyzeIssueWithAI, analyzeWithModel, 
  createIssueSummary, getFallbackAnalysis, 
  mockAnalyzeIssue, selectAnalysisStrategy } from '@/lib/ai-service';

export async function POST(request: NextRequest) {
  try {
    const { repoUrl, batchIndex, batchSize = 20, totalBatches } = await request.json();

    if (!repoUrl || batchIndex === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameters: repoUrl and batchIndex are required' },
        { status: 400 }
      );
    }

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
    }

    console.log(`🔍 Fetching issues from ${repoInfo.owner}/${repoInfo.repo} for batch ${batchIndex}`);
    const allIssues = await fetchGitHubIssues(repoInfo.owner, repoInfo.repo);
    
    if (allIssues.length === 0) {
      return NextResponse.json({ error: 'No open issues found in this repository' }, { status: 404 });
    }

    // Calculate which issues to process in this batch
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, allIssues.length);
    const batchIssues = allIssues.slice(startIndex, endIndex);

    console.log(`📦 Processing batch ${batchIndex}: issues ${startIndex + 1}-${endIndex} of ${allIssues.length}`);

    // Use mock analysis if no API key is configured
    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

    // Analyze this specific batch
    const analyzedBatchIssues = await analyzeBatchIssues(batchIssues, shouldUseMock);

    // Calculate batch-specific summary
    const complexityDistribution: Record<number, number> = {};
    const categoryBreakdown: Record<string, number> = {};
    let totalBudgetMin = 0;
    let totalBudgetMax = 0;

    analyzedBatchIssues.forEach(issue => {
      complexityDistribution[issue.complexity] = (complexityDistribution[issue.complexity] || 0) + 1;
      categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
      
      const costMatch = issue.estimated_cost.match(/\$(\d+)-?\$?(\d+)?/);
      if (costMatch) {
        totalBudgetMin += parseInt(costMatch[1]);
        totalBudgetMax += parseInt(costMatch[2] || costMatch[1]);
      }
    });

    const batchSummary = {
      total_issues: analyzedBatchIssues.length,
      total_budget_min: totalBudgetMin,
      total_budget_max: totalBudgetMax,
      complexity_distribution: complexityDistribution,
      category_breakdown: categoryBreakdown,
      average_confidence: analyzedBatchIssues.reduce((sum, issue) => sum + issue.confidence, 0) / analyzedBatchIssues.length
    };

    console.log(`✅ Batch ${batchIndex} complete: ${analyzedBatchIssues.length} issues analyzed`);

    return NextResponse.json({
      data: {
        issues: analyzedBatchIssues,
        summary: batchSummary
      },
      batchIndex,
      isLastBatch: endIndex >= allIssues.length,
      totalProcessed: endIndex
    });

  } catch (error) {
    console.error('Batch analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Batch processing failed' },
      { status: 500 }
    );
  }
}

// Batch analysis function (optimized for batch processing)
async function analyzeBatchIssues(issues: any[], shouldUseMock: boolean): Promise<any[]> {
  const analyzedIssues: any[] = [];
  
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    
    try {
      let analysis;
      
      if (shouldUseMock) {
        // Use mock analysis
        analysis = mockAnalyzeIssue(issue);
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // Real AI analysis with multi-stage pipeline
        const strategy = selectAnalysisStrategy(issue);
        let analysisContent = '';

        // Stage 1: Summarization (if needed)
        if (strategy.needsSummarization) {
          analysisContent = await createIssueSummary(issue);
        } else {
          analysisContent = `ISSUE #${issue.number}: ${issue.title}\nDESCRIPTION: ${issue.body || 'No description'}`;
        }

        // Stage 2: Analysis
        analysis = await analyzeWithModel(strategy.model, issue, analysisContent);
      }
      
      // Store result
      analyzedIssues.push({ ...issue, ...analysis });

    } catch (error) {
      console.error(`Error analyzing issue #${issue.number}:`, error);
      
      // Use fallback analysis
      const fallbackAnalysis = getFallbackAnalysis(issue);
      analyzedIssues.push({ ...issue, ...fallbackAnalysis });
    }

    // Add small delay between issues to avoid rate limiting
    if (i < issues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return analyzedIssues;
}