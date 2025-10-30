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
    { name: 'Nounspace', url: 'https://github.com/Nounspace/nounspace.ts' },
    { name: 'SkateHive', url: 'https://github.com/SkateHive/skatehive3.0' },
    { name: 'Next.js', url: 'https://github.com/vercel/next.js' },
    { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript' }
  ];


  return (
    <div className="max-w-2xl mx-auto">
      <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-700/50 relative overflow-hidden">
        
        {/* Background Glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              Issue Estimator
            </h1>
            <p className="text-slate-400 text-lg max-w-md mx-auto">
              Analyze GitHub repositories and estimate development costs with AI precision
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label htmlFor="repoUrl" className="block text-sm font-medium text-slate-300">
                GitHub Repository URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500">🔗</span>
                </div>
                <input
                  type="url"
                  id="repoUrl"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  className="block w-full pl-10 pr-4 py-4 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-blur-sm"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !repoUrl.trim()}
              className="w-full btn-primary py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Analyzing Repository...</span>
                </div>
              ) : (
                'Analyze Issues'
              )}
            </button>
          </form>

          {/* Examples */}
          <div className="mt-8 pt-6 border-t border-slate-700/50">
            <p className="text-center text-slate-500 text-sm mb-4">Try with these examples:</p>
            <div className="flex flex-wrap gap-3 justify-center">
              {exampleRepos.map((repo) => (
                <button
                  key={repo.url}
                  type="button"
                  onClick={() => setRepoUrl(repo.url)}
                  className="btn-secondary px-4 py-2 rounded-lg text-slate-300 text-sm transition-all duration-200 hover:text-white"
                >
                  {repo.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="glass-card rounded-xl p-6 text-center border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">🤖</span>
          </div>
          <h3 className="font-semibold text-white mb-2">AI Powered</h3>
          <p className="text-slate-400 text-sm">Advanced analysis with machine learning</p>
        </div>
        
        <div className="glass-card rounded-xl p-6 text-center border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">💰</span>
          </div>
          <h3 className="font-semibold text-white mb-2">Cost Estimation</h3>
          <p className="text-slate-400 text-sm">Accurate budget planning</p>
        </div>
        
        <div className="glass-card rounded-xl p-6 text-center border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">⚡</span>
          </div>
          <h3 className="font-semibold text-white mb-2">Fast Analysis</h3>
          <p className="text-slate-400 text-sm">Quick insights in seconds</p>
        </div>
      </div>
    </div>
  );
}