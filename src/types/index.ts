// src/types/index.ts
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
  state: string;
  html_url: string;
  created_at: string;
  comments: number;
}

export interface AnalyzedIssue extends GitHubIssue {
  complexity: number;
  estimated_cost: string;
  category: string;
  confidence: number;
  key_factors: string[];
  potential_risks: string[];
  recommended_actions: string[];
  ai_analysis: string;
}

export interface AnalysisSummaryType {
    total_issues: number;
    total_budget_min: number;
    total_budget_max: number;
    complexity_distribution: Record<number, number>;
    category_breakdown: Record<string, number>;
    average_confidence: number;
  analyzedIssues?: number;
  highPriorityIssues?: number;
  completedAt?: string;
  batchProgress?: {
    current: number;
    total: number;
    isComplete: boolean;
  };
}

export interface AnalysisResult {
  issues: AnalyzedIssue[];
  summary: AnalysisSummaryType;
  metadata?: {
    repoUrl: string;
    analyzedAt: string;
    analysisType: string;
  };
}

export interface AnalysisProgressType {
  totalIssues: number;
  analyzedIssues: number;
  currentStage: 'fetching' | 'summarizing' | 'analyzing' | 'complete';
  issues: {
    [issueNumber: number]: {
      title: string;
      status: 'pending' | 'summarizing' | 'analyzing' | 'complete' | 'error';
      currentStage?: string;
      progress: number;
      model?: string;
      summaryTokens?: number;
      estimatedTimeRemaining?: string;
    }
  };
  estimatedTotalTime: number;
  startTime: number;
  // For batch progress display
  current?: number;
  total?: number;
  message?: string;
}

export interface BatchState {
  currentBatch: number;
  totalBatches: number;
  completedBatches: number;
  processedIssues: number;
  totalIssues: number;
  isComplete: boolean;
}

// Add this interface for batch responses
export interface BatchResponse {
  data: {
    issues: AnalyzedIssue[];
    summary?: Partial<AnalysisSummaryType>;
  };
  batchIndex: number;
  isLastBatch: boolean;
}