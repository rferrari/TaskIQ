import { AnalysisResult } from '@/types';
import { StatCard } from './ui/StatCard';

interface AnalysisSummaryProps {
  data: AnalysisResult;
}

export function AnalysisSummary({ data }: AnalysisSummaryProps) {
  const { summary } = data;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        title="Total Issues"
        value={summary.total_issues}
        description="Open issues analyzed"
      />
      <StatCard
        title="Total Budget"
        value={`$${summary.total_budget_min} - $${summary.total_budget_max}`}
        description="Estimated cost range"
      />
      <StatCard
        title="Avg Confidence"
        value={`${(summary.average_confidence * 100).toFixed(0)}%`}
        description="AI analysis confidence"
      />
      <StatCard
        title="High Complexity"
        value={summary.complexity_distribution[5] || 0}
        description="Very Complex Issues"
      />
    </div>
  );
}