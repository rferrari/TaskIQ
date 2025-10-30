'use client';

import { AnalysisProgressType } from '@/types';

interface AnalysisProgressProps {
  progress: AnalysisProgressType;
  repoUrl: string;
}

export function AnalysisProgress({ progress, repoUrl }: AnalysisProgressProps) {
  const elapsedTime = Date.now() - progress.startTime;
  const progressPercentage = (progress.analyzedIssues / progress.totalIssues) * 100;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'summarizing': return '📝';
      case 'analyzing': return '🧠';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  const getStatusText = (status: string, currentStage?: string) => {
    switch (status) {
      case 'pending': return 'Waiting for analysis slot';
      case 'summarizing': return 'Creating summary...';
      case 'analyzing': return currentStage ? `Analyzing with ${currentStage}...` : 'Analyzing...';
      case 'complete': return 'Analysis complete';
      case 'error': return 'Analysis failed';
      default: return 'Unknown status';
    }
  };

  // Sort issues for display - choose one of these options:

  // Option 1: Sort by issue number (ascending - oldest first)
  const sortedIssues = Object.entries(progress.issues).sort(([aNum], [bNum]) => 
    parseInt(aNum) - parseInt(bNum)
  );

  // Option 2: Sort by issue number (descending - newest first, like GitHub)
  // const sortedIssues = Object.entries(progress.issues).sort(([aNum], [bNum]) => 
  //   parseInt(bNum) - parseInt(aNum)
  // );

  // Option 3: Sort by status (pending first, then in progress, then complete)
  // const statusPriority = { pending: 0, summarizing: 1, analyzing: 2, complete: 3, error: 4 };
  // const sortedIssues = Object.entries(progress.issues).sort(([, a], [, b]) => 
  //   statusPriority[a.status as keyof typeof statusPriority] - statusPriority[b.status as keyof typeof statusPriority]
  // );

  return (
    <div className="glass-card rounded-2xl border border-gray-800 p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔍</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Analyzing Repository</h1>
        <p className="text-gray-400">{repoUrl}</p>
      </div>

      {/* Overall Progress */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>Overall Progress</span>
          <span>{progress.analyzedIssues} of {progress.totalIssues} issues analyzed</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>Started {Math.floor(elapsedTime / 1000)}s ago</span>
          <span>~{Math.ceil((progress.totalIssues - progress.analyzedIssues) * 2.5)}s remaining</span>
        </div>
      </div>

      {/* Current Stage */}
      <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
            <span className="text-sm">🚀</span>
          </div>
          <div>
            <div className="text-white font-medium">Current Stage: {progress.currentStage}</div>
            <div className="text-gray-400 text-sm">
              {progress.currentStage === 'fetching' && 'Fetching issues from GitHub...'}
              {progress.currentStage === 'summarizing' && 'Creating summaries for large issues...'}
              {progress.currentStage === 'analyzing' && 'AI analysis in progress...'}
              {progress.currentStage === 'complete' && 'Analysis complete!'}
            </div>
          </div>
        </div>
      </div>

      {/* Individual Issue Progress */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Issue Analysis Progress</h3>
        
        {sortedIssues.map(([issueNumber, issueProgress]) => (
          <div key={issueNumber} className="p-4 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-lg">{getStatusIcon(issueProgress.status)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">
                    #{issueNumber} {issueProgress.title}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {getStatusText(issueProgress.status, issueProgress.currentStage)}
                  </div>
                </div>
              </div>
              
              {issueProgress.progress > 0 && issueProgress.progress < 100 && (
                <div className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                  {issueProgress.progress}%
                </div>
              )}
            </div>

            {/* Progress bar for individual issue */}
            {issueProgress.status !== 'complete' && issueProgress.status !== 'error' && (
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                <div 
                  className="bg-gradient-to-r from-green-400 to-blue-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${issueProgress.progress}%` }}
                ></div>
              </div>
            )}

            {/* Additional info */}
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              {issueProgress.summaryTokens && (
                <span>Summary: {issueProgress.summaryTokens} tokens</span>
              )}
              {issueProgress.model && (
                <span>Model: {issueProgress.model}</span>
              )}
              {issueProgress.estimatedTimeRemaining && (
                <span>ETA: {issueProgress.estimatedTimeRemaining}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Analysis Stats */}
      <div className="mt-6 pt-4 border-t border-gray-700">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-400">{progress.analyzedIssues}</div>
            <div className="text-xs text-gray-400">Completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">
              {Object.values(progress.issues).filter(issue => issue.status === 'analyzing').length}
            </div>
            <div className="text-xs text-gray-400">Analyzing</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">
              {Object.values(progress.issues).filter(issue => issue.status === 'pending').length}
            </div>
            <div className="text-xs text-gray-400">Pending</div>
          </div>
        </div>
      </div>
    </div>
  );
}