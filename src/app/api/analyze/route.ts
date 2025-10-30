// src/app/api/analyze/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store'; // ✅ ensure no caching
export const preferredRegion = 'auto'; // optional

import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { AnalysisResult, AnalysisProgressType } from '@/types';
import { analyzeIssueWithAI, analyzeWithModel, 
  createIssueSummary, getFallbackAnalysis, 
  mockAnalyzeIssue, selectAnalysisStrategy } from '@/lib/ai-service';

// Helper function to calculate summary (moved outside main function)
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

// Helper function for token estimation (needed for progress)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function POST(request: NextRequest) {
  try {
    const { repoUrl, batchSize = 20, batchIndex = 0, totalBatches = 0 } = await request.json();

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

    // BATCHING DECISION LOGIC
    const BATCH_THRESHOLD = 10; // If more than 10 issues, use batching
    const shouldUseBatching = issues.length > BATCH_THRESHOLD;

    if (shouldUseBatching && batchIndex === 0) {
      // First batch request - return batching info to client
      const batches = Math.ceil(issues.length / batchSize);
      
      console.log(`🔄 Large repository detected (${issues.length} issues). Using batch processing: ${batches} batches`);
      
      return NextResponse.json({
        requiresBatching: true,
        totalBatches: batches,
        totalIssues: issues.length,
        batchSize,
        message: `Large repository detected. Will process in ${batches} batches.`
      });
    }

    // If we get here, either:
    // 1. It's a small repo (no batching needed)
    // 2. It's a batch request (batchIndex > 0)
    
    if (shouldUseBatching && batchIndex > 0) {
      // This should be handled by the batch endpoint, but if called here, redirect logic
      console.log(`🔄 Batch request detected for batch ${batchIndex}`);
      
      // Calculate which issues to process in this batch
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, issues.length);
      const batchIssues = issues.slice(startIndex, endIndex);
      
      console.log(`📦 Processing batch ${batchIndex}: issues ${startIndex + 1}-${endIndex} of ${issues.length}`);

    // Use mock analysis if no API key is configured
    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

      // Analyze this specific batch
      const analyzedBatchIssues = await analyzeBatchIssues(batchIssues, shouldUseMock);

      return NextResponse.json({
        data: {
          issues: analyzedBatchIssues,
          summary: calculateSummary(analyzedBatchIssues)
        },
        batchIndex,
        isLastBatch: endIndex >= issues.length
      });
    }

    // SMALL REPO - Process all issues at once (original logic)
    console.log(`📊 Small repository (${issues.length} issues), processing in single batch`);
    
    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

    // For small repos, use SSE streaming as before
    const progress: AnalysisProgressType = {
      totalIssues: issues.length,
      analyzedIssues: 0,
      currentStage: 'fetching',
      issues: {},
      estimatedTotalTime: issues.length * 3000, // 3s per issue estimate
      startTime: Date.now()
    };

    // Initialize progress for each issue
    issues.forEach(issue => {
      progress.issues[issue.number] = {
        title: issue.title,
        status: 'pending',
        progress: 0
      };
    });

    console.log('📋 Progress tracker initialized');

    // Create SSE stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    console.log('🚀 Sending initial progress...');

    // Send initial progress
    try {
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`));
      console.log('✅ Initial progress sent successfully');
    } catch (writeError) {
      console.error('❌ Failed to send initial progress:', writeError);
    }

    // Start analysis in background and stream progress
    analyzeWithProgress(issues, progress, writer, encoder, shouldUseMock).then(async (analyzedIssues) => {
      // Calculate final summary
      const summary = calculateSummary(analyzedIssues);

      const result: AnalysisResult = {
        issues: analyzedIssues,
        summary
      };

      console.log(`✅ Analysis complete for ${repoInfo.owner}/${repoInfo.repo}`);
      console.log(`\n📊 ANALYSIS SUMMARY for ${repoInfo.owner}/${repoInfo.repo}:`);
      console.log(`Total issues analyzed: ${analyzedIssues.length}`);
      console.log(`Complexity distribution:`, summary.complexity_distribution);
      console.log(`Category breakdown:`, summary.category_breakdown);
      console.log(`Total budget: $${summary.total_budget_min} - $${summary.total_budget_max}`);
      console.log(`Average confidence: ${(summary.average_confidence * 100).toFixed(1)}%\n`);

      // Send final result
      writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`));
      writer.close();
    });

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no', // <— 🟢 CRITICAL for Vercel/Node to avoid buffering
      },
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    );
  }
}

// Batch analysis function (without SSE)
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

    // Add small delay between issues
    if (i < issues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Batch analysis complete: ${analyzedIssues.length} issues processed`);
  return analyzedIssues;
}

// Keep your existing analyzeWithProgress function for small repos
async function analyzeWithProgress(
  issues: any[], 
  progress: AnalysisProgressType, 
  writer: any, 
  encoder: any, 
  shouldUseMock: boolean
): Promise<any[]> {
  const analyzedIssues: any[] = [];
  
  const updateProgress = async () => {
    writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`));
  };

  // Update stage to summarizing
  progress.currentStage = 'summarizing';
  await updateProgress();

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    
    // Update issue status to summarizing
    progress.issues[issue.number].status = 'summarizing';
    progress.issues[issue.number].progress = 25;
    await updateProgress();

    try {
      let analysis;
      
      if (shouldUseMock) {
        // Use mock analysis
        progress.issues[issue.number].status = 'analyzing';
        progress.issues[issue.number].currentStage = 'mock';
        progress.issues[issue.number].progress = 75;
        await updateProgress();

        analysis = mockAnalyzeIssue(issue);
        
        // Simulate some processing time for better UX
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } else {
        // Real AI analysis with multi-stage pipeline
        const strategy = selectAnalysisStrategy(issue);
        let analysisContent = '';

        // Stage 1: Summarization (if needed)
        if (strategy.needsSummarization) {
          progress.issues[issue.number].currentStage = 'Creating summary';
          await updateProgress();

          analysisContent = await createIssueSummary(issue);
          progress.issues[issue.number].summaryTokens = estimateTokens(analysisContent);
          progress.issues[issue.number].progress = 50;
        } else {
          analysisContent = `ISSUE #${issue.number}: ${issue.title}\nDESCRIPTION: ${issue.body || 'No description'}`;
          progress.issues[issue.number].progress = 50;
        }
        await updateProgress();

        // Stage 2: Analysis
        progress.issues[issue.number].status = 'analyzing';
        progress.issues[issue.number].currentStage = strategy.model;
        progress.issues[issue.number].progress = 75;
        await updateProgress();

        analysis = await analyzeWithModel(strategy.model, issue, analysisContent);
      }
      
      // Mark as complete
      progress.issues[issue.number].status = 'complete';
      progress.issues[issue.number].progress = 100;
      progress.analyzedIssues++;
      await updateProgress();

      // Store result
      analyzedIssues.push({ ...issue, ...analysis });

    } catch (error) {
      console.error(`Error analyzing issue #${issue.number}:`, error);
      progress.issues[issue.number].status = 'error';
      progress.issues[issue.number].progress = 100;
      progress.analyzedIssues++;
      await updateProgress();
      
      // Use fallback analysis
      const fallbackAnalysis = getFallbackAnalysis(issue);
      analyzedIssues.push({ ...issue, ...fallbackAnalysis });
    }

    // Add small delay between issues for better UX
    if (i < issues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  progress.currentStage = 'complete';
  await updateProgress();

  return analyzedIssues;
}
