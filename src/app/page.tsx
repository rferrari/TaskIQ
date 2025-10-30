// src/app/page.tsx - Fixed version
'use client';

import { useState, useRef } from 'react';
import { RepositoryForm } from '@/components/RepositoryForm';
import { AnalysisSummary } from '@/components/AnalysisSummary';
import { IssuesTable } from '@/components/IssuesTable';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AnalysisResult, AnalysisProgressType, BatchState, AnalyzedIssue } from '@/types';
import { config } from '@/config';

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

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          repoUrl,
          batchSize: config.ai.batchSize,
          requestDelay: config.ai.requestDelay,
          enableProgressTracking: config.features.enableProgressTracking
        }),
        signal: abortControllerRef.current.signal,
      });

      responseRef.current = response;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to start analysis: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      await handleSSEStream(response);

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

  const handleSSEStream = async (response: Response) => {
    // Add proper null check here
    if (!response.body) {
      throw new Error('No response body available for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('Stream completed normally');
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log('Received SSE data:', data.type);
                
                if (data.type === 'progress') {
                  setAnalysisProgress(data.data);
                  
                  if (data.data.batchInfo) {
                    setBatchState({
                      currentBatch: data.data.batchInfo.currentBatch,
                      totalBatches: data.data.batchInfo.totalBatches,
                      completedBatches: data.data.batchInfo.completedBatches,
                      processedIssues: data.data.analyzedIssues,
                      totalIssues: data.data.totalIssues,
                      isComplete: false
                    });
                  }
                  
                } else if (data.type === 'complete') {
                  setAnalysisResult(data.data);
                  setIsLoading(false);
                  isProcessingRef.current = false;
                  
                  if (batchState) {
                    setBatchState(prev => prev ? { ...prev, isComplete: true } : null);
                  }

                  // Clean up stream
                  try {
                    await reader.cancel();
                  } catch (cancelError) {
                    console.log('Stream already cancelled:', cancelError);
                  }
                  try {
                    reader.releaseLock();
                  } catch (lockError) {
                    console.log('Lock already released:', lockError);
                  }
                  
                  console.log('✅ Analysis complete, stream closed');
                  return;
                  
                } else if (data.type === 'batch_start') {
                  console.log(`🔄 Starting batch ${data.data.batchIndex + 1}/${data.data.totalBatches}`);
                  setBatchState({
                    currentBatch: data.data.batchIndex + 1,
                    totalBatches: data.data.totalBatches,
                    completedBatches: data.data.batchIndex,
                    processedIssues: data.data.processedIssues,
                    totalIssues: data.data.totalIssues,
                    isComplete: false
                  });
                  
                } else if (data.type === 'batch_complete') {
                  console.log(`✅ Batch ${data.data.batchIndex + 1} completed`);
                  setBatchState(prev => prev ? {
                    ...prev,
                    completedBatches: data.data.batchIndex + 1,
                    processedIssues: data.data.processedIssues
                  } : null);
                } else if (data.type === 'partial_result') {
                  // Update with partial results
                  setAnalysisResult(data.data);
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError, 'Line:', line);
              }
            }
          }
        }
      } catch (streamError: any) {
        if (streamError.name === 'AbortError') {
          console.log('Stream reading was aborted');
        } else {
          console.error('Stream error:', streamError);
          setError('Analysis stream was interrupted');
        }
        setIsLoading(false);
        isProcessingRef.current = false;
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {
          console.log('Reader lock already released:', e);
        }
      }
    };

    processStream();
  };

  const handleNewAnalysis = () => {
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
    // Show batch progress if we're in batch mode and no individual progress
    if (batchState && !analysisProgress && !analysisResult) {
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