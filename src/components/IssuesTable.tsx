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

  const sortedAndFilteredIssues = useMemo(() => {
    let filtered = issues;
    
    // Filter by complexity
    if (filterComplexity !== 'all') {
      filtered = filtered.filter(issue => issue.complexity === parseInt(filterComplexity));
    }
    
    // Sort issues
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
      1: 'bg-green-100 text-green-800',
      2: 'bg-blue-100 text-blue-800',
      3: 'bg-yellow-100 text-yellow-800',
      4: 'bg-orange-100 text-orange-800',
      5: 'bg-red-100 text-red-800'
    };
    return colors[complexity as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      bug: 'bg-red-100 text-red-800',
      feature: 'bg-green-100 text-green-800',
      enhancement: 'bg-blue-100 text-blue-800',
      documentation: 'bg-gray-100 text-gray-800',
      refactor: 'bg-purple-100 text-purple-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Table Controls */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex gap-4 flex-wrap">
          <div>
            <label htmlFor="sort" className="block text-sm font-medium text-gray-700 mb-1">
              Sort by
            </label>
            <select
              id="sort"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            >
              <option value="complexity">Complexity</option>
              <option value="estimated_cost">Cost</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="filter" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by complexity
            </label>
            <select
              id="filter"
              value={filterComplexity}
              onChange={(e) => setFilterComplexity(e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            >
              <option value="all">All</option>
              <option value="1">1 - Trivial</option>
              <option value="2">2 - Simple</option>
              <option value="3">3 - Moderate</option>
              <option value="4">4 - Complex</option>
              <option value="5">5 - Very Complex</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 text-sm font-medium"
        >
          Export CSV
        </button>
      </div>

      {/* Issues Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Issue
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Complexity
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estimated Cost
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Labels
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedAndFilteredIssues.map((issue) => (
              <tr key={issue.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <a
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-900"
                    >
                      #{issue.number} {issue.title}
                    </a>
                    <p className="text-sm text-gray-500 truncate max-w-xs">
                      {issue.ai_analysis}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getComplexityColor(issue.complexity)}`}>
                    {issue.complexity}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {issue.estimated_cost}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getCategoryColor(issue.category)}`}>
                    {issue.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${issue.confidence * 100}%` }}
                      ></div>
                    </div>
                    <span className="ml-2 text-sm text-gray-600">
                      {(issue.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {issue.labels.slice(0, 3).map((label) => (
                      <span
                        key={label.name}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                        style={{ 
                          backgroundColor: `#${label.color}20`,
                          color: `#${label.color}`
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                    {issue.labels.length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        +{issue.labels.length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-600">
          Showing {sortedAndFilteredIssues.length} of {issues.length} issues
        </p>
      </div>
    </div>
  );
}