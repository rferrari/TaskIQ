// src/app/api/analyze/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const preferredRegion = 'auto';

import { NextRequest, NextResponse } from 'next/server';
import { extractRepoInfo, fetchGitHubIssues } from '@/lib/github';
import { AnalysisResult, AnalysisProgressType } from '@/types';
import { analyzeWithModel, createIssueSummary, getFallbackAnalysis, mockAnalyzeIssue, selectAnalysisStrategy } from '@/lib/ai-service';
import { config } from '@/config';

// Simple in-memory store for active analyses
const activeAnalyses = new Map<string, { abortController: AbortController }>();

// Helper function to calculate summary
function calculateSummary(issues: any[]) {
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

// Helper function for token estimation
function estimateTokens(text: string): number {
  return Math.ceil((text?.length || 0) / 4);
}

// SSE helper functions
async function sendProgress(writer: any, encoder: any, progress: any) {
  try {
    if (writer.desiredSize !== null) { // Check if stream is still writable
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`));
    }
  } catch (error) {
    console.error('Failed to send progress - stream may be closed:', error);
  }
}

async function sendBatchStart(writer: any, encoder: any, data: any) {
  try {
    if (writer.desiredSize !== null) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'batch_start', data })}\n\n`));
    }
  } catch (error) {
    console.error('Failed to send batch start - stream may be closed:', error);
  }
}

async function sendBatchComplete(writer: any, encoder: any, data: any) {
  try {
    if (writer.desiredSize !== null) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'batch_complete', data })}\n\n`));
    }
  } catch (error) {
    console.error('Failed to send batch complete - stream may be closed:', error);
  }
}

async function sendPartialResult(writer: any, encoder: any, result: any) {
  try {
    if (writer.desiredSize !== null) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'partial_result', data: result })}\n\n`));
    }
  } catch (error) {
    console.error('Failed to send partial result - stream may be closed:', error);
  }
}

async function sendComplete(writer: any, encoder: any, result: any) {
  try {
    if (writer.desiredSize !== null) {
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'complete', data: result })}\n\n`));
    }
  } catch (error) {
    console.error('Failed to send complete - stream may be closed:', error);
  }
}

// Safe writer close function
async function safeWriterClose(writer: any) {
  try {
    if (writer.desiredSize !== null) {
      await writer.close();
      console.log('✅ Writer closed successfully');
    } else {
      console.log('⚠️ Writer already closed, skipping close operation');
    }
  } catch (error: any) {
    console.log('⚠️ Writer close failed (likely already closed):', error.message);
  }
}

// Safe writer write function that checks stream state
async function safeWriterWrite(writer: any, encoder: any, data: string) {
  try {
    if (writer.desiredSize !== null) {
      await writer.write(encoder.encode(data));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to write to stream:', error);
    return false;
  }
}

// Update the main POST function with better error handling
export async function POST(request: NextRequest) {
  let analysisId: string | null = null;
  let writer: any = null;
  let stream: TransformStream | null = null;
  
  try {
    const { repoUrl, batchSize = config.ai.batchSize, requestDelay = config.ai.requestDelay } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 });
    }

    // Generate a unique ID for this analysis
    analysisId = `${repoUrl}-${Date.now()}`;
    const abortController = new AbortController();
    
    // Store the analysis for potential cancellation
    activeAnalyses.set(analysisId, { abortController });

    const repoInfo = extractRepoInfo(repoUrl);
    if (!repoInfo) {
      activeAnalyses.delete(analysisId);
      return NextResponse.json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
    }

    console.log(`🔍 Fetching issues from ${repoInfo.owner}/${repoInfo.repo}`);
    const issues = await fetchGitHubIssues(repoInfo.owner, repoInfo.repo);
    
    if (issues.length === 0) {
      activeAnalyses.delete(analysisId);
      return NextResponse.json({ error: 'No open issues found in this repository' }, { status: 404 });
    }

    // Use mock analysis if no API key is configured
    const shouldUseMock = !process.env.OPENAI_API_KEY;
    if (shouldUseMock) {
      console.warn('⚠️ No OPENAI_API_KEY found, using mock analysis');
    }

    console.log(`📊 Starting analysis for ${issues.length} issues`);

    // Create SSE stream
    stream = new TransformStream();
    writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // Start analysis with connection tracking
    analyzeWithTransparentBatching(issues, writer, encoder, shouldUseMock, {
      batchSize,
      requestDelay,
      repoUrl,
      analysisId,
      abortSignal: abortController.signal
    }).then(async () => {
      console.log(`✅ Analysis ${analysisId} completed successfully`);
      await safeWriterClose(writer);
      activeAnalyses.delete(analysisId!);
    }).catch(async (error) => {
      console.error(`❌ Analysis ${analysisId} failed:`, error);
      await safeWriterClose(writer);
      activeAnalyses.delete(analysisId!);
    });

    // Handle client disconnection
    const handleAbort = () => {
      console.log(`🛑 Client disconnected, cancelling analysis: ${analysisId}`);
      abortController.abort();
      activeAnalyses.delete(analysisId!);
      // Note: We don't close writer here as the stream is already closed by the client disconnect
    };

    request.signal.addEventListener('abort', handleAbort);

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
    // Clean up on error
    if (analysisId) {
      activeAnalyses.delete(analysisId);
    }
    if (writer) {
      await safeWriterClose(writer);
    }
    
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze repository' },
      { status: 500 }
    );
  }
}

// Add a cleanup endpoint to manually cancel analyses
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get('id');
  
  if (analysisId && activeAnalyses.has(analysisId)) {
    activeAnalyses.get(analysisId)!.abortController.abort();
    activeAnalyses.delete(analysisId);
    console.log(`✅ Cancelled analysis: ${analysisId}`);
    return NextResponse.json({ success: true });
  }
  
  return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
}

// Transparent batch processing with SSE
async function analyzeWithTransparentBatching(
  issues: any[], 
  writer: any, 
  encoder: any, 
  shouldUseMock: boolean,
  options: { 
    batchSize: number; 
    requestDelay: number; 
    repoUrl: string;
    analysisId: string;
    abortSignal?: AbortSignal;
  }
): Promise<void> {
  
  const { batchSize, requestDelay, repoUrl, analysisId, abortSignal } = options;
  
  // Check if already aborted
  if (abortSignal?.aborted) {
    console.log(`🛑 Analysis ${analysisId} was aborted before starting`);
    return;
  }

  // Check if stream is still writable at the start
  if (writer.desiredSize === null) {
    console.log(`🛑 Stream closed before analysis started for ${analysisId}`);
    return;
  }

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
    batchInfo: {
      currentBatch: 0,
      totalBatches,
      completedBatches: 0,
      totalIssues: sortedIssues.length
    }
  };

  // Initialize progress for each issue
  sortedIssues.forEach(issue => {
    if (issue && issue.number) {
      progress.issues[issue.number] = {
        title: issue.title || 'Unknown Title',
        status: 'pending',
        progress: 0
      };
    }
  });

  // Send initial progress only if stream is still open
  if (writer.desiredSize !== null) {
    await sendProgress(writer, encoder, progress);
  }

  console.log(`🔄 Starting transparent batch processing: ${totalBatches} batches`);

  // Process issues in batches
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    // Check for abort signal before each batch
    if (abortSignal?.aborted) {
      console.log(`🛑 Analysis ${analysisId} was aborted during batch processing`);
      if (writer.desiredSize !== null) {
      await sendProgress(writer, encoder, {
        ...progress,
        currentStage: 'complete',
        analyzedIssues: analyzedIssues.length
      });
      }
      return;
    }

    // Check if stream is still writable
    if (writer.desiredSize === null) {
      console.log(`🛑 Stream closed during batch processing for ${analysisId}`);
      return;
    }

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
    
    if (writer.desiredSize !== null) {
    await sendProgress(writer, encoder, progress);
    }

    // Process each issue in current batch with individual progress
    for (let i = 0; i < batchIssues.length; i++) {
      // Check for abort signal before each issue
      if (abortSignal?.aborted) {
        console.log(`🛑 Analysis ${analysisId} was aborted during issue processing`);
        if (writer.desiredSize !== null) {
        await sendProgress(writer, encoder, {
          ...progress,
          currentStage: 'complete',
          analyzedIssues: analyzedIssues.length
        });
        }
        return;
      }

      // Check if stream is still writable
      if (writer.desiredSize === null) {
        console.log(`🛑 Stream closed during issue processing for ${analysisId}`);
        return;
      }

      const issue = batchIssues[i];
      const globalIndex = startIndex + i;

      // Skip invalid issues
      if (!issue || !issue.number) {
        console.warn(`⚠️ Skipping invalid issue at index ${globalIndex}`);
        continue;
      }

      try {
        const analyzedIssue = await analyzeSingleIssueWithProgress(
          issue, 
          progress, 
          writer, 
          encoder, 
          shouldUseMock,
          globalIndex,
          abortSignal
        );
        
        if (analyzedIssue) {
          analyzedIssues.push(analyzedIssue);
        }

      } catch (error: any) {
        // Check if this was an abort error
        if (error.name === 'AbortError') {
          console.log(`🛑 Analysis ${analysisId} was aborted`);
          if (writer.desiredSize !== null) {
          await sendProgress(writer, encoder, {
            ...progress,
            currentStage: 'complete',
            analyzedIssues: analyzedIssues.length
          });
          }
          return;
        }
        
        console.error(`Error analyzing issue #${issue.number}:`, error);
        
        // Mark as error but continue
        progress.issues[issue.number].status = 'error';
        progress.issues[issue.number].progress = 100;
        progress.analyzedIssues++;
        
        if (writer.desiredSize !== null) {
        await sendProgress(writer, encoder, progress);
        }
        
        // Use fallback analysis
        try {
          const fallbackAnalysis = getFallbackAnalysis(issue);
          analyzedIssues.push({ ...issue, ...fallbackAnalysis });
        } catch (fallbackError) {
          console.error(`Even fallback analysis failed for issue #${issue.number}:`, fallbackError);
        }
      }

      // Respect request delay from config
      if (i < batchIssues.length - 1 && requestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, requestDelay));
      }
    }

    // Notify batch completion
    if (writer.desiredSize !== null) {
    await sendBatchComplete(writer, encoder, {
      batchIndex,
      totalBatches,
      processedIssues: analyzedIssues.length,
      totalIssues: sortedIssues.length
    });
    }

    console.log(`✅ Batch ${batchIndex + 1} completed: ${batchIssues.length} issues analyzed`);

    // Show partial results after each batch
    if (analyzedIssues.length > 0 && writer.desiredSize !== null) {
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

  // Finalize results only if stream is still open
  if (writer.desiredSize === null) {
    console.log(`🛑 Stream closed before finalizing results for ${analysisId}`);
    return;
  }

  console.log(`✅ All batches complete: ${analyzedIssues.length} issues analyzed`);
  
  const finalSummary = calculateSummary(analyzedIssues);
  const finalResult: AnalysisResult = {
    issues: analyzedIssues,
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
  globalIndex: number,
  abortSignal?: AbortSignal
): Promise<any> {
  
  // Check for abort signal
  if (abortSignal?.aborted) {
    throw new Error('Analysis was aborted');
  }
  
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

    // Check for abort during mock processing
    if (abortSignal?.aborted) {
      throw new Error('Analysis was aborted');
    }

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

      // Check for abort during summarization
      if (abortSignal?.aborted) {
        throw new Error('Analysis was aborted');
      }

      analysisContent = await createIssueSummary(issue);
      progress.issues[issue.number].summaryTokens = estimateTokens(analysisContent);
      progress.issues[issue.number].progress = 50;
    } else {
      analysisContent = `ISSUE #${issue.number}: ${issue.title}\nDESCRIPTION: ${issue.body || 'No description'}`;
      progress.issues[issue.number].progress = 50;
    }
    await sendProgress(writer, encoder, progress);

    // Check for abort before analysis
    if (abortSignal?.aborted) {
      throw new Error('Analysis was aborted');
    }

    // Stage 2: Analysis
    progress.issues[issue.number].status = 'analyzing';
    progress.issues[issue.number].currentStage = strategy.model;
    progress.issues[issue.number].progress = 75;
    await sendProgress(writer, encoder, progress);

    analysis = await analyzeWithModel(strategy.model, issue, analysisContent, abortSignal);
  }
  
  // Mark as complete
  progress.issues[issue.number].status = 'complete';
  progress.issues[issue.number].progress = 100;
  progress.analyzedIssues++;
  await sendProgress(writer, encoder, progress);

  return { ...issue, ...analysis };
}