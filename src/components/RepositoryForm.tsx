'use client';

import { useState } from 'react';

interface RepositoryFormProps {
  onAnalyze: (repoUrl: string) => void;
  isLoading: boolean;
}

export function RepositoryForm({ onAnalyze, isLoading }: RepositoryFormProps) {
  const [repoUrl, setRepoUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoUrl.trim()) {
      onAnalyze(repoUrl.trim());
    }
  };

  const exampleRepos = [
    { name: 'Next.js', url: 'https://github.com/vercel/next.js' },
    { name: 'React', url: 'https://github.com/facebook/react' },
    { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript' }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Issue Estimator</h1>
        <p className="text-gray-600 mb-6">
          Analyze GitHub repository issues and estimate development costs
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700 mb-2">
            GitHub Repository URL
          </label>
          <input
            type="url"
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repository"
            className="block w-full rounded-md border border-gray-300 bg-white py-3 px-4 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !repoUrl.trim()}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {isLoading ? 'Analyzing Repository...' : 'Analyze Issues'}
        </button>
      </form>

      <div className="mt-6">
        <p className="text-sm text-gray-600 mb-3">Try with these examples:</p>
        <div className="flex flex-wrap gap-2">
          {exampleRepos.map((repo) => (
            <button
              key={repo.url}
              type="button"
              onClick={() => setRepoUrl(repo.url)}
              className="text-sm text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md transition-colors"
            >
              {repo.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}