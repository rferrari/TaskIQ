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
    { name: 'TypeScript', url: 'https://github.com/microsoft/TypeScript' },
    { name: 'Zcash', url: 'https://github.com/zcash/zcash' }
  ];

  const tiers = [
    {
      name: 'Free Tier',
      icon: '🎯',
      features: [
        '1 concurrent analysis slot',
        'Basic issue analysis',
        'Export to CSV',
        'Real-time progress tracking'
      ],
      current: true
    },
    {
      name: 'Pro',
      icon: '🚀',
      features: [
        'Multiple concurrent analyses',
        'Priority processing',
        'Save analysis history',
        'Advanced analytics',
        'Team collaboration',
        'API access'
      ],
      current: false
    }
  ];

  const upcomingFeatures = [
    {
      title: 'Real-time Results',
      description: 'See analysis as it completes, no need to wait for entire repo',
      icon: '⚡'
    },
    {
      title: 'Analysis History',
      description: 'Save and compare past repository analyses',
      icon: '📊'
    },
    {
      title: 'Team Workspaces',
      description: 'Collaborate with your team on project estimations',
      icon: '👥'
    }
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-700/50 relative overflow-hidden">
        
        {/* Background Glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
        
        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              TaskIQ
            </h1>
            <p className="text-slate-400 text-lg max-w-md mx-auto">
              Analyze GitHub repositories and estimate development costs with AI that not only estimates, but explains its reasoning.
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
            <span className="text-lg">🧠</span>
          </div>
          <h3 className="font-semibold text-white mb-2">Reasoning Transparency</h3>
          <p className="text-slate-400 text-sm">Understand why each estimate was made view key factors, risks, and actions.</p>
        </div>
        
        <div className="glass-card rounded-xl p-6 text-center border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">💰</span>
          </div>
          <h3 className="font-semibold text-white mb-2">Cost Estimation</h3>
          <p className="text-slate-400 text-sm">Estimate task budgets with consistent, explainable logic.</p>
        </div>
        
        <div className="glass-card rounded-xl p-6 text-center border border-slate-700/50">
          <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg">⚡</span>
          </div>
          <h3 className="font-semibold text-white mb-2">Fast Analysis</h3>
          <p className="text-slate-400 text-sm">Scan any GitHub repo and get structured, exportable data in seconds.</p>
        </div>
      </div>

      {/* Tier Information */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-white text-center mb-8">Plans & Features</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current Tier */}
          <div className="glass-card rounded-2xl p-6 border border-green-500/30 relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="bg-green-500/20 text-green-300 text-xs px-3 py-1 rounded-full border border-green-500/30">
                Current
              </span>
            </div>
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mr-4">
                <span className="text-xl">{tiers[0].icon}</span>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{tiers[0].name}</h3>
                <p className="text-slate-400 text-sm">Perfect for individual developers</p>
              </div>
            </div>
            <ul className="space-y-3">
              {tiers[0].features.map((feature, index) => (
                <li key={index} className="flex items-center text-slate-300 text-sm">
                  <span className="text-green-400 mr-3">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Coming Soon Tier */}
          <div className="glass-card rounded-2xl p-6 border border-purple-500/30 relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="bg-purple-500/20 text-purple-300 text-xs px-3 py-1 rounded-full border border-purple-500/30">
                Coming Soon
              </span>
            </div>
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mr-4">
                <span className="text-xl">{tiers[1].icon}</span>
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{tiers[1].name}</h3>
                <p className="text-slate-400 text-sm">For teams and power users</p>
              </div>
            </div>
            <ul className="space-y-3">
              {tiers[1].features.map((feature, index) => (
                <li key={index} className="flex items-center text-slate-400 text-sm">
                  <span className="text-purple-400 mr-3">⏳</span>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-6 pt-4 border-t border-slate-700/50">
              {/* <p className="text-slate-500 text-sm text-center">
                Interested? <button className="text-purple-400 hover:text-purple-300 underline">Join waitlist</button>
              </p> */}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Features */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-white text-center mb-8">What's Coming Next</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {upcomingFeatures.map((feature, index) => (
            <div key={index} className="glass-card rounded-xl p-6 border border-slate-700/50 hover:border-blue-500/30 transition-all duration-300">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-4">
                <span className="text-lg">{feature.icon}</span>
              </div>
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Call to Action */}
      <div className="mt-12 text-center">
        <div className="glass-card rounded-2xl p-8 border border-slate-700/50">
          <h3 className="text-xl font-bold text-white mb-4">Ready to analyze your repository?</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Start with our free tier and get instant insights into your project's development needs.
          </p>
          <button
            onClick={() => document.getElementById('repoUrl')?.focus()}
            className="btn-primary px-8 py-3 rounded-xl font-semibold"
          >
            Start Analyzing Now
          </button>
        </div>
      </div>
    </div>
  );
}