'use client';

import { useState, useMemo } from 'react';
import { AnalyzedIssue } from '@/types';
import { downloadCSV, generateCSV } from '@/lib/csv-generator';

interface IssuesTableProps {
  issues: AnalyzedIssue[];
}

export function IssuesTable({ issues }: IssuesTableProps) {
  const [sortField, setSortField] = useState<'complexity' | 'estimated_cost' | 'confidence'>('complexity');
  const [filterComplexity, setFilterComplexity] = useState<string>('all');


  const getComplexityLabel = (complexity: number): string => {
    const labels = {
      1: 'Trivial',
      2: 'Simple', 
      3: 'Moderate',
      4: 'Complex',
      5: 'Very Complex'
    };
    return labels[complexity as keyof typeof labels] || 'Unknown';
  };


  const sortedAndFilteredIssues = useMemo(() => {
    let filtered = issues;
    


    if (filterComplexity !== 'all') {
      filtered = filtered.filter(issue => getComplexityLabel(issue.complexity) === filterComplexity);
    }
    
    return [...filtered].sort((a, b) => {
      if (sortField === 'complexity') {
        return b.complexity - a.complexity;
      }
      if (sortField === 'estimated_cost') {
        const costA = parseInt(a.estimated_cost.match(/\$(\d+)/)?.[1] || '0');
        const costB = parseInt(b.estimated_cost.match(/\$(\d+)/)?.[1] || '0');
        return costB - costA;
      }
      if (sortField === 'confidence') {
        return b.confidence - a.confidence;
      }
      return 0;
    });
  }, [issues, sortField, filterComplexity]);

  const handleExportCSV = () => {
    const csv = generateCSV(sortedAndFilteredIssues);
    downloadCSV(csv, 'issue-estimates.csv');
  };

  const getComplexityColor = (complexity: number) => {
    const colors = {
      1: 'bg-green-500/20 text-green-300 border border-green-500/30',
      2: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
      3: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
      4: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
      5: 'bg-red-500/20 text-red-300 border border-red-500/30'
    };
    return colors[complexity as keyof typeof colors] || 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      bug: 'bg-red-500/20 text-red-300 border border-red-500/30',
      feature: 'bg-green-500/20 text-green-300 border border-green-500/30',
      enhancement: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
      documentation: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
      refactor: 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
    };
    return colors[category] || 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
  };

  // Truncate long text
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="glass-card rounded-2xl border border-gray-800">
      {/* Table Controls */}
      <div className="p-4 border-b border-gray-800 flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="flex gap-3 flex-wrap">
          <div className="min-w-[140px]">
            <label htmlFor="sort" className="block text-sm font-medium text-gray-300 mb-2">
              Sort by
            </label>
            <select
              id="sort"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="block w-full rounded-lg bg-gray-900 border border-gray-700 text-white py-2 px-3 focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="complexity">Complexity</option>
              <option value="estimated_cost">Cost</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>
          
          <div className="min-w-[160px]">
            <label htmlFor="filter" className="block text-sm font-medium text-gray-300 mb-2">
              Filter complexity
            </label>
            <select
              id="filter"
              value={filterComplexity}
              onChange={(e) => setFilterComplexity(e.target.value)}
              className="block w-full rounded-lg bg-gray-900 border border-gray-700 text-white py-2 px-3 focus:ring-1 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">All Complexities</option>
              <option value="Trivial">Trivial</option>
              <option value="Simple">Simple</option>
              <option value="Moderate">Moderate</option>
              <option value="Complex">Complex</option>
              <option value="Very Complex">Very Complex</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          className="btn-primary px-4 py-2 rounded-lg text-sm font-medium mt-2 sm:mt-0"
        >
          Export CSV
        </button>
      </div>

      {/* Compact Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-900/50">
            <tr>
              <th scope="col" className="py-3 pl-4 pr-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-7/12">
                Issue
              </th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-2/12">
                Complexity
              </th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-2/12">
                Cost
              </th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-2/12">
                Type
              </th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-1/12">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sortedAndFilteredIssues.map((issue) => (
              <tr key={issue.id} className="hover:bg-gray-800/30 transition-colors">
                {/* Issue Column */}
                <td className="py-3 pl-4 pr-2">
                  <div className="flex flex-col space-y-2">
                    <a
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-400 hover:text-blue-300 leading-tight"
                      title={`#${issue.number} ${issue.title}`}
                    >
                      <span className="text-gray-500 font-mono">#{issue.number}</span>{' '}
                      {truncateText(issue.title, 50)}
                    </a>
                    <div className="flex flex-wrap gap-1">
                      {issue.labels.slice(0, 2).map((label) => (
                        <span
                          key={label.name}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border"
                          style={{ 
                            backgroundColor: `#${label.color}15`,
                            color: `#${label.color}`,
                            borderColor: `#${label.color}30`
                          }}
                          title={label.name}
                        >
                          {truncateText(label.name, 15)}
                        </span>
                      ))}
                      {issue.labels.length > 2 && (
                        <span 
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-700 text-gray-300 border border-gray-600"
                          title={`+${issue.labels.length - 2} more labels`}
                        >
                          +{issue.labels.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                
                {/* Complexity */}
                <td className="py-3 px-2">
                  <span 
                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getComplexityColor(issue.complexity)}`}
                    title={`Complexity: ${getComplexityLabel(issue.complexity)} (Level ${issue.complexity})`}
                  >
                    {truncateText(getComplexityLabel(issue.complexity), 10)}
                  </span>
                </td>
                
                {/* Estimated Cost */}
                <td className="py-3 px-2 text-sm font-medium text-white">
                  {issue.estimated_cost}
                </td>
                
                {/* Category Type */}
                <td className="py-3 px-2">
                  <span 
                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium capitalize ${getCategoryColor(issue.category)}`}
                    title={issue.category}
                  >
                    {truncateText(issue.category, 12)}
                  </span>
                </td>
                
                {/* Confidence */}
                <td className="py-3 px-2">
                  <div className="flex flex-col items-center space-y-1" title={`${(issue.confidence * 100).toFixed(0)}% confidence`}>
                    <div className="w-12 bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full" 
                        style={{ width: `${issue.confidence * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-300 font-medium">
                      {(issue.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/30">
        <p className="text-sm text-gray-400">
          Showing {sortedAndFilteredIssues.length} of {issues.length} issues
        </p>
      </div>
    </div>
  );
}