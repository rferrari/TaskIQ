'use client';

import { useState } from 'react';
import { RepositoryForm } from '@/components/RepositoryForm';
import { AnalysisSummary } from '@/components/AnalysisSummary';
import { IssuesTable } from '@/components/IssuesTable';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AnalysisResult } from '@/types';

export default function Home() {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (repoUrl: string) => {
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repoUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze repository');
      }

      const result = await response.json();
      setAnalysisResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewAnalysis = () => {
    setAnalysisResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {!analysisResult && (
          <div className="max-w-2xl mx-auto">
            <RepositoryForm onAnalyze={handleAnalyze} isLoading={isLoading} />
          </div>
        )}

        {isLoading && (
  <div className="max-w-4xl mx-auto">
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg p-8">
      <LoadingSpinner />
      <p className="text-center text-gray-600 dark:text-gray-400 mt-4">
        Analyzing repository issues... This may take a minute.
      </p>
    </div>
  </div>
)}

        {error && (
  <div className="max-w-2xl mx-auto">
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Analysis Failed</h3>
                  <p className="text-sm text-red-700 mt-2">{error}</p>
                </div>
              </div>
              {!analysisResult && (
                <button
                  onClick={handleNewAnalysis}
                  className="mt-4 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-sm font-medium"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}

        {analysisResult && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">Analysis Results</h1>
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
        )}
      </div>
    </div>
  );
}