// src/app/api/analyze/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const preferredRegion = 'auto';

import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { AnalysisResult, AnalysisProgressType } from '@/types';
import { analyzeWithModel, createIssueSummary, getFallbackAnalysis, mockAnalyzeIssue, selectAnalysisStrategy } from '@/lib/ai-service';
import { config } from '@/config'; // Add this import

// Helper function to calculate summary
// SSE helper functions
async function sendProgress(writer: any, encoder: any, progress: any) {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`));
}

async function sendBatchStart(writer: any, encoder: any, data: any) {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'batch_start', data })}\n\n`));
}

async function sendBatchComplete(writer: any, encoder: any, data: any) {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'batch_complete', data })}\n\n`));
}

async function sendPartialResult(writer: any, encoder: any, result: any) {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'partial_result', data: result })}\n\n`));
}

async function sendComplete(writer: any, encoder: any, result: any) {
  writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`));
}

// cost calculation function
function calculateSummary(issues: any[]) {

  return calculateSummaryWithDebug(issues); // For debugging

  const complexityDistribution: Record<number, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  let totalBudgetMin = 0;
  let totalBudgetMax = 0;

  issues.forEach(issue => {
    complexityDistribution[issue.complexity] = (complexityDistribution[issue.complexity] || 0) + 1;
    categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
    
    // FIXED: Proper cost parsing
    const costMatch = issue.estimated_cost.match(/\$(\d+)(?:\s*-\s*\$\s*(\d+))?/);
    if (costMatch) {
      const minCost = parseInt(costMatch[1]);
      const maxCost = costMatch[2] ? parseInt(costMatch[2]) : minCost;
      
      totalBudgetMin += minCost;
      totalBudgetMax += maxCost;
    } else {
      console.warn(`Could not parse cost for issue #${issue.number}: "${issue.estimated_cost}"`);
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

// Add debugging to see what's happening
function calculateSummaryWithDebug(issues: any[]) {
  const complexityDistribution: Record<number, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  let totalBudgetMin = 0;
  let totalBudgetMax = 0;

  console.log('🔍 DEBUG: Cost calculation for issues:');
  
  issues.forEach(issue => {
    complexityDistribution[issue.complexity] = (complexityDistribution[issue.complexity] || 0) + 1;
    categoryBreakdown[issue.category] = (categoryBreakdown[issue.category] || 0) + 1;
    
    // Multiple cost parsing strategies
    let minCost = 0;
    let maxCost = 0;
    
    // Strategy 1: Match "$XXX-XXX" or "$XXX-$XXX"
    let costMatch = issue.estimated_cost.match(/\$(\d+)(?:\s*-\s*\$\s*(\d+))?/);
    
    if (costMatch) {
      minCost = parseInt(costMatch[1]);
      maxCost = costMatch[2] ? parseInt(costMatch[2]) : minCost;
    } else {
      // Strategy 2: Match any numbers in the string
      const numbers = issue.estimated_cost.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        minCost = parseInt(numbers[0]);
        maxCost = parseInt(numbers[1]);
      } else if (numbers && numbers.length === 1) {
        minCost = maxCost = parseInt(numbers[0]);
      } else {
        // Strategy 3: Fallback based on complexity
        if (issue.complexity >= 7) {
          minCost = 300; maxCost = 600; // Complex
        } else if (issue.complexity >= 4) {
          minCost = 120; maxCost = 300; // Moderate
        } else {
          minCost = 50; maxCost = 120; // Simple
        }
        console.warn(`Using fallback cost for issue #${issue.number}: $${minCost}-$${maxCost}`);
      }
    }
    
    console.log(`Issue #${issue.number}: "${issue.estimated_cost}" -> $${minCost}-$${maxCost}`);
    
    totalBudgetMin += minCost;
    totalBudgetMax += maxCost;
  });

  console.log(`💰 DEBUG: Total calculated: $${totalBudgetMin}-$${totalBudgetMax}`);

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
    const { repoUrl, batchSize = config.ai.batchSize, requestDelay = config.ai.requestDelay } = await request.json();

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

    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

    console.log(`📊 Starting analysis for ${issues.length} issues`);

    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    analyzeWithTransparentBatching(issues, writer, encoder, shouldUseMock, {
      batchSize,
      requestDelay,
      repoUrl
    }).then(() => {
      writer.close();
    });

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
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

// New function: Transparent batch processing with SSE
async function analyzeWithTransparentBatching(
  issues: any[], 
  writer: any, 
  encoder: any, 
  shouldUseMock: boolean,
  options: { batchSize: number; requestDelay: number; repoUrl: string }
): Promise<void> {
  
  const { batchSize, requestDelay, repoUrl } = options;
  
  // Sort issues by issue number (ascending) to match the progress display
  const sortedIssues = [...issues].sort((a, b) => a.number - b.number);
  
  const totalBatches = Math.ceil(sortedIssues.length / batchSize);
  const analyzedIssues: any[] = [];
  
  // Initialize progress tracker
  const progress: AnalysisProgressType = {
    totalIssues: sortedIssues.length,
    analyzedIssues: 0,
    currentStage: 'fetching',
    issues: {},
    estimatedTotalTime: sortedIssues.length * 3000,
    startTime: Date.now(),
    // Add batch info for transparency
    batchInfo: {
      currentBatch: 0,
      totalBatches,
      completedBatches: 0,
      totalIssues: sortedIssues.length
    }
  };

  // Initialize progress in the same sorted order
  sortedIssues.forEach(issue => {
    progress.issues[issue.number] = {
      title: issue.title,
      status: 'pending',
      progress: 0
    };
  });

  // Send initial progress
  await sendProgress(writer, encoder, progress);

  console.log(`🔄 Starting transparent batch processing: ${totalBatches} batches`);

  // Process issues in batches, in display order
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIndex = batchIndex * batchSize;
    const endIndex = Math.min(startIndex + batchSize, sortedIssues.length);
    const batchIssues = sortedIssues.slice(startIndex, endIndex);

    // Notify batch start
    await sendBatchStart(writer, encoder, {
      batchIndex,
      totalBatches,
      processedIssues: analyzedIssues.length,
      totalIssues: sortedIssues.length
    });

    console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (issues ${startIndex + 1}-${endIndex})`);

    // Update batch info in progress
    progress.batchInfo = {
      currentBatch: batchIndex + 1,
      totalBatches,
      completedBatches: batchIndex,
      totalIssues: sortedIssues.length
    };
    await sendProgress(writer, encoder, progress);

    // Process each issue in current batch with individual progress
    for (let i = 0; i < batchIssues.length; i++) {
      const issue = batchIssues[i];
      const globalIndex = startIndex + i;

      try {
        const analyzedIssue = await analyzeSingleIssueWithProgress(
          issue, 
          progress, 
          writer, 
          encoder, 
          shouldUseMock,
          globalIndex
        );
        
        analyzedIssues.push(analyzedIssue);

      } catch (error) {
        console.error(`Error analyzing issue #${issue.number}:`, error);
        
        // Mark as error but continue
        progress.issues[issue.number].status = 'error';
        progress.issues[issue.number].progress = 100;
        progress.analyzedIssues++;
        await sendProgress(writer, encoder, progress);
        
        // Use fallback analysis
        const fallbackAnalysis = getFallbackAnalysis(issue);
        analyzedIssues.push({ ...issue, ...fallbackAnalysis });
      }

      // Respect request delay from config
      if (i < batchIssues.length - 1 && requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, requestDelay));
      }
    }

    // Notify batch completion
    await sendBatchComplete(writer, encoder, {
      batchIndex,
      totalBatches,
      processedIssues: analyzedIssues.length,
      totalIssues: sortedIssues.length
    });

    console.log(`✅ Batch ${batchIndex + 1} completed: ${batchIssues.length} issues analyzed`);

    // Show partial results after each batch
    if (analyzedIssues.length > 0) {
      const partialSummary = calculateSummary(analyzedIssues);
      const partialResult: AnalysisResult = {
        issues: analyzedIssues,
        summary: partialSummary,
        metadata: {
          repoUrl,
          analyzedAt: new Date().toISOString(),
          analysisType: 'batch',
          batchProgress: {
            current: batchIndex + 1,
            total: totalBatches,
            isComplete: false
          }
        }
      };

      // Send partial results for immediate display
      await sendPartialResult(writer, encoder, partialResult);
    }
  }

  // Finalize results
  console.log(`✅ All batches complete: ${analyzedIssues.length} issues analyzed`);
  
  const finalSummary = calculateSummary(analyzedIssues);
   const finalResult: AnalysisResult = {
    issues: analyzedIssues, // Original processing order
    // OR for table order:
    // issues: analyzedIssues.sort((a, b) => (sortMap.get(a.number) || 0) - (sortMap.get(b.number) || 0)),
    summary: finalSummary,
    metadata: {
      repoUrl,
      analyzedAt: new Date().toISOString(),
      analysisType: 'batch',
      batchProgress: {
        current: totalBatches,
        total: totalBatches,
        isComplete: true
      }
    }
  };

  // Mark progress as complete
  progress.currentStage = 'complete';
  progress.analyzedIssues = analyzedIssues.length;
  await sendProgress(writer, encoder, progress);

  // Send final result
  await sendComplete(writer, encoder, finalResult);
}

// Helper function to analyze single issue with progress updates
async function analyzeSingleIssueWithProgress(
  issue: any,
  progress: AnalysisProgressType,
  writer: any,
  encoder: any,
  shouldUseMock: boolean,
  globalIndex: number
): Promise<any> {
  
  // Update issue status to summarizing
  progress.issues[issue.number].status = 'summarizing';
  progress.issues[issue.number].progress = 25;
  await sendProgress(writer, encoder, progress);

  let analysis;
  
  if (shouldUseMock) {
    // Mock analysis with progress simulation
    progress.issues[issue.number].status = 'analyzing';
    progress.issues[issue.number].currentStage = 'mock';
    progress.issues[issue.number].progress = 75;
    await sendProgress(writer, encoder, progress);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 800));
    
    analysis = mockAnalyzeIssue(issue);
    
  } else {
    // Real AI analysis with progress updates
    const strategy = selectAnalysisStrategy(issue);
    let analysisContent = '';

    // Stage 1: Summarization
    if (strategy.needsSummarization) {
      progress.issues[issue.number].currentStage = 'Creating summary';
      await sendProgress(writer, encoder, progress);

      analysisContent = await createIssueSummary(issue);
      progress.issues[issue.number].summaryTokens = estimateTokens(analysisContent);
      progress.issues[issue.number].progress = 50;
    } else {
      analysisContent = `ISSUE #${issue.number}: ${issue.title}\nDESCRIPTION: ${issue.body || 'No description'}`;
      progress.issues[issue.number].progress = 50;
    }
    await sendProgress(writer, encoder, progress);

    // Stage 2: Analysis
    progress.issues[issue.number].status = 'analyzing';
    progress.issues[issue.number].currentStage = strategy.model;
    progress.issues[issue.number].progress = 75;
    await sendProgress(writer, encoder, progress);

    analysis = await analyzeWithModel(strategy.model, issue, analysisContent);
  }
  
  // Mark as complete
  progress.issues[issue.number].status = 'complete';
  progress.issues[issue.number].progress = 100;
  progress.analyzedIssues++;
  await sendProgress(writer, encoder, progress);

  return { ...issue, ...analysis };
}
