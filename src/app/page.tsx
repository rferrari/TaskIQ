// src/app/page.tsx
'use client';

import { useState, useRef } from 'react';
import { RepositoryForm } from '@/components/RepositoryForm';
import { AnalysisSummary } from '@/components/AnalysisSummary';
import { IssuesTable } from '@/components/IssuesTable';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AnalysisResult, AnalysisProgressType, BatchState, AnalyzedIssue, AnalysisSummaryType, BatchResponse } from '@/types';

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressType | null>(null);
  const [currentRepoUrl, setCurrentRepoUrl] = useState<string>('');
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  
  // Refs to track processing and abort controller
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseRef = useRef<Response | null>(null);
  const accumulatedResultsRef = useRef<AnalyzedIssue[]>([]);

  const handleAnalyze = async (repoUrl: string) => {
    // Prevent multiple simultaneous analyses
    if (isProcessingRef.current) {
      console.log('Analysis already in progress, aborting previous');
      abortControllerRef.current?.abort();
    }
    
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setAnalysisProgress(null);
    setBatchState(null);
    setCurrentRepoUrl(repoUrl);
    isProcessingRef.current = true;
    accumulatedResultsRef.current = [];

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          repoUrl,
          batchSize: 20, // Process 20 issues per batch
          batchIndex: 0, // Start with first batch
          totalBatches: 0 // Server will calculate this
        }),
        signal: abortControllerRef.current.signal,
      });

      responseRef.current = response;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to start analysis: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.requiresBatching) {
        // Start batch processing
        await processInBatches(repoUrl, result.totalBatches, result.totalIssues);
      } else {
        // Single batch processing for small repos
        setAnalysisResult(result.data);
        setIsLoading(false);
        isProcessingRef.current = false;
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }

      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setIsLoading(false);
      isProcessingRef.current = false;
    }
  };
            
  const processInBatches = async (repoUrl: string, totalBatches: number, totalIssues: number) => {
    console.log(`Starting batch processing: ${totalBatches} batches, ${totalIssues} total issues`);
    
    setBatchState({
      currentBatch: 0,
      totalBatches,
      completedBatches: 0,
      processedIssues: 0,
      totalIssues,
      isComplete: false
    });

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (!isProcessingRef.current) {
        console.log('Batch processing interrupted');
              break;
            }

                try {
        console.log(`Processing batch ${batchIndex + 1}/${totalBatches}`);
                  
        setBatchState(prev => prev ? {
          ...prev,
          currentBatch: batchIndex + 1
        } : null);

        const batchResult = await processSingleBatch(repoUrl, batchIndex, totalBatches);
                    
        if (batchResult && batchResult.issues) {
          // Accumulate results
          accumulatedResultsRef.current = [
            ...accumulatedResultsRef.current,
            ...batchResult.issues
          ];
                    
          // Update progress
          setBatchState(prev => prev ? {
            ...prev,
            completedBatches: batchIndex + 1,
            processedIssues: accumulatedResultsRef.current.length
          } : null);
                    
          // Show intermediate progress with partial results
          setAnalysisProgress({
            totalIssues,
            analyzedIssues: accumulatedResultsRef.current.length,
            currentStage: 'analyzing',
            issues: {},
            estimatedTotalTime: 0,
            startTime: Date.now(),
            current: batchIndex + 1,
            total: totalBatches,
            message: `Processed ${batchIndex + 1}/${totalBatches} batches (${accumulatedResultsRef.current.length}/${totalIssues} issues)`
          });
                    
          // Show partial results after each batch
          if (batchIndex === 0 || (batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
            const partialSummary: AnalysisSummaryType = {
              total_issues: totalIssues,
                analyzedIssues: accumulatedResultsRef.current.length,
                highPriorityIssues: accumulatedResultsRef.current.filter(issue => 
                issue.complexity >= 7 // Define high priority based on complexity
                ).length,
              total_budget_min: accumulatedResultsRef.current.reduce((sum, issue) => {
                const cost = parseFloat(issue.estimated_cost.replace(/[^0-9.]/g, '')) || 0;
                return sum + cost * 0.8; // min estimate
              }, 0),
              total_budget_max: accumulatedResultsRef.current.reduce((sum, issue) => {
                const cost = parseFloat(issue.estimated_cost.replace(/[^0-9.]/g, '')) || 0;
                return sum + cost * 1.2; // max estimate
              }, 0),
              complexity_distribution: accumulatedResultsRef.current.reduce((dist, issue) => {
                dist[issue.complexity] = (dist[issue.complexity] || 0) + 1;
                return dist;
              }, {} as Record<number, number>),
              category_breakdown: accumulatedResultsRef.current.reduce((breakdown, issue) => {
                breakdown[issue.category] = (breakdown[issue.category] || 0) + 1;
                return breakdown;
              }, {} as Record<string, number>),
              average_confidence: accumulatedResultsRef.current.length > 0 
                ? accumulatedResultsRef.current.reduce((sum, issue) => sum + issue.confidence, 0) / accumulatedResultsRef.current.length
                : 0,
                completedAt: new Date().toISOString(),
                batchProgress: {
                  current: batchIndex + 1,
                  total: totalBatches,
                  isComplete: false
                      }
            };

            setAnalysisResult({
              issues: accumulatedResultsRef.current,
              summary: partialSummary,
              metadata: {
                repoUrl,
                analyzedAt: new Date().toISOString(),
                analysisType: 'batch'
              }
            });
                    }
                    
          // Add delay between batches to avoid rate limiting
          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
      } catch (batchError: any) {
        console.error(`Batch ${batchIndex + 1} failed:`, batchError);
        
        if (batchError.name === 'AbortError') {
          break;
              }
        
        // Continue with next batch even if one fails
        console.log(`Continuing with next batch after error in batch ${batchIndex + 1}`);
        continue;
            }
          }

    // Finalize results
    if (isProcessingRef.current && accumulatedResultsRef.current.length > 0) {
      console.log('Batch processing complete, finalizing results');

      const finalSummary: AnalysisSummaryType = {
        total_issues: accumulatedResultsRef.current.length,
          analyzedIssues: accumulatedResultsRef.current.length,
          highPriorityIssues: accumulatedResultsRef.current.filter(issue => 
          issue.complexity >= 7
          ).length,
        total_budget_min: accumulatedResultsRef.current.reduce((sum, issue) => {
          const cost = parseFloat(issue.estimated_cost.replace(/[^0-9.]/g, '')) || 0;
          return sum + cost * 0.8;
        }, 0),
        total_budget_max: accumulatedResultsRef.current.reduce((sum, issue) => {
          const cost = parseFloat(issue.estimated_cost.replace(/[^0-9.]/g, '')) || 0;
          return sum + cost * 1.2;
        }, 0),
        complexity_distribution: accumulatedResultsRef.current.reduce((dist, issue) => {
          dist[issue.complexity] = (dist[issue.complexity] || 0) + 1;
          return dist;
        }, {} as Record<number, number>),
        category_breakdown: accumulatedResultsRef.current.reduce((breakdown, issue) => {
          breakdown[issue.category] = (breakdown[issue.category] || 0) + 1;
          return breakdown;
        }, {} as Record<string, number>),
        average_confidence: accumulatedResultsRef.current.reduce((sum, issue) => sum + issue.confidence, 0) / accumulatedResultsRef.current.length,
          completedAt: new Date().toISOString(),
          batchProgress: {
            current: totalBatches,
            total: totalBatches,
            isComplete: true
          }
      };

      const finalResult: AnalysisResult = {
        issues: accumulatedResultsRef.current,
        summary: finalSummary,
        metadata: {
          repoUrl,
          analyzedAt: new Date().toISOString(),
          analysisType: 'batch'
        }
      };

      setAnalysisResult(finalResult);
      setBatchState(prev => prev ? { ...prev, isComplete: true } : null);
      }
      
      setIsLoading(false);
      isProcessingRef.current = false;
  };

  const processSingleBatch = async (repoUrl: string, batchIndex: number, totalBatches: number): Promise<{ issues: AnalyzedIssue[] } | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 240000);

    try {
      const response = await fetch('/api/analyze-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          repoUrl,
          batchIndex,
          batchSize: 20,
          totalBatches
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Batch ${batchIndex + 1} failed: ${response.status}`);
      }

      const result: BatchResponse = await response.json();
      return result.data;
    } catch (error) {
      console.error(`Error processing batch ${batchIndex + 1}:`, error);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleNewAnalysis = () => {
    // FIX: Abort any ongoing request when starting new analysis
    if (isProcessingRef.current) {
      console.log('Aborting current analysis for new one');
      abortControllerRef.current?.abort();
    }
    
    setAnalysisResult(null);
    setAnalysisProgress(null);
    setBatchState(null);
    setError(null);
    setCurrentRepoUrl('');
    isProcessingRef.current = false;
    abortControllerRef.current = null;
    responseRef.current = null;
    accumulatedResultsRef.current = [];
  };

  // Enhanced progress display that shows batch progress
  const renderContent = () => {
    // Show batch progress if we're in batch mode
    if (batchState && !analysisResult) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-2xl p-8">
            <div className="text-center">
              <LoadingSpinner />
              <h2 className="text-xl font-semibold text-white mt-4">
                Processing Repository in Batches
              </h2>
              <div className="mt-6 space-y-4">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Batch Progress</span>
                  <span>{batchState.completedBatches}/{batchState.totalBatches}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(batchState.completedBatches / batchState.totalBatches) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Issues Processed</span>
                  <span>{batchState.processedIssues}/{batchState.totalIssues}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(batchState.processedIssues / batchState.totalIssues) * 100}%` }}
                  />
                </div>
                <p className="text-gray-400 text-sm mt-4">
                  Processing batch {batchState.currentBatch} of {batchState.totalBatches}...
                  {batchState.completedBatches > 0 && ` (${Math.round((batchState.completedBatches / batchState.totalBatches) * 100)}% complete)`}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Show regular progress for non-batch analysis
    if (analysisProgress && !analysisResult) {
      return <AnalysisProgress progress={analysisProgress} repoUrl={currentRepoUrl} />;
    }

    // Show results
    if (analysisResult) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
            <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
              {batchState?.isComplete && (
                <p className="text-green-400 text-sm mt-1">
                  ✓ Completed in {batchState.totalBatches} batches
                </p>
              )}
            </div>
            <button
              onClick={handleNewAnalysis}
              className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm font-medium"
            >
              Analyze Another Repository
            </button>
          </div>
          <AnalysisSummary data={analysisResult} />
          <IssuesTable issues={analysisResult.issues} />
        </div>
      );
    }

    // Show loading state
    if (isLoading && !analysisProgress) {
      return (
        <div className="max-w-4xl mx-auto">
          <div className="glass-card rounded-2xl p-8">
            <LoadingSpinner />
            <p className="text-center text-gray-400 mt-4">
              Starting analysis... Preparing to fetch repository issues.
            </p>
          </div>
        </div>
      );
    }

    // Show error state
    if (error) {
      return (
        <div className="max-w-2xl mx-auto">
          <div className="bg-red-900/20 border border-red-800 rounded-2xl p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-300">Analysis Failed</h3>
                <p className="text-sm text-red-200 mt-2">{error}</p>
              </div>
            </div>
            <button
              onClick={handleNewAnalysis}
              className="mt-4 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    // Default: show repository form
    return (
      <div className="max-w-2xl mx-auto">
        <RepositoryForm onAnalyze={handleAnalyze} isLoading={isLoading} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {renderContent()}
      </div>
    </div>
  );
}