'use client';

import { useState, useRef } from 'react';
import { RepositoryForm } from '@/components/RepositoryForm';
import { AnalysisSummary } from '@/components/AnalysisSummary';
import { IssuesTable } from '@/components/IssuesTable';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AnalysisResult, AnalysisProgressType } from '@/types';

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressType | null>(null);
  const [currentRepoUrl, setCurrentRepoUrl] = useState<string>('');
  
  // Refs to track processing and abort controller
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const responseRef = useRef<Response | null>(null);

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
    setCurrentRepoUrl(repoUrl);
    isProcessingRef.current = true;

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repoUrl }),
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

      // Handle SSE stream
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
            
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  console.log('Received SSE data:', data.type);
                  
                  if (data.type === 'progress') {
                    setAnalysisProgress(data.data);
                  } else if (data.type === 'complete') {
                    setAnalysisResult(data.data);
                    setIsLoading(false);
                    isProcessingRef.current = false;

                    // ✅ FIX: Complete stream cleanup as recommended
                    console.log('Analysis complete, performing complete stream cleanup...');
                    
                    // 1. Cancel the reader
                    await reader.cancel();
                    console.log('✅ Reader cancelled');
                    
                    // 2. Flush TextDecoder buffer
                    decoder.decode(); // Flush any remaining bytes
                    console.log('✅ TextDecoder flushed');
                    
                    // 3. Release the reader lock
                    reader.releaseLock();
                    console.log('✅ Reader lock released');
                    
                    // 4. Close the response body if available
                    if (responseRef.current?.body) {
                      try {
                        await responseRef.current.body.cancel();
                        console.log('✅ Response body cancelled');
                      } catch (e) {
                        console.log('Response body already closed:', e);
                      }
                    }
                    
                    console.log('✅ Stream fully closed');
                    return; // Exit when complete
                  }
                } catch (parseError) {
                  console.error('Error parsing SSE data:', parseError, 'Line:', line);
                }
              }
            }
          }
        } catch (streamError: any) {
          // Check if this was an abort error
          if (streamError.name === 'AbortError') {
            console.log('Stream reading was aborted');
          } else {
            console.error('Stream error:', streamError);
            setError('Analysis stream was interrupted');
          }
          setIsLoading(false);
          isProcessingRef.current = false;
        } finally {
          // ✅ FIX: Always release the lock and clean up
          try {
            reader.releaseLock();
            console.log('Reader lock released in finally block');
          } catch (e) {
            console.log('Reader lock already released:', e);
          }
        }
      };

      // Start processing the stream without blocking
      processStream();

    } catch (err: any) {
      // Check if this was an abort error
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

  const handleNewAnalysis = () => {
    // ✅ FIX: Abort any ongoing request when starting new analysis
    if (isProcessingRef.current) {
      console.log('Aborting current analysis for new one');
      abortControllerRef.current?.abort();
    }
    
    setAnalysisResult(null);
    setAnalysisProgress(null);
    setError(null);
    setCurrentRepoUrl('');
    isProcessingRef.current = false;
    abortControllerRef.current = null;
    responseRef.current = null;
  };

  // ... rest of your renderContent and return remain the same ...
  // Determine what to show based on current state
  const renderContent = () => {
    // Show progress if we have progress data and no result yet
    if (analysisProgress && !analysisResult) {
      return <AnalysisProgress progress={analysisProgress} repoUrl={currentRepoUrl} />;
    }

    // Show results if we have them
    if (analysisResult) {
      return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
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