import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Issue Estimator - AI-Powered GitHub Analysis',
  description: 'Transform GitHub issues into actionable tasks with AI-powered cost estimation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen bg-background text-foreground`}>
        <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
          {/* Header */}
          <header className="glass-effect border-b border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">📊</span>
                  </div>
                  <h1 className="text-xl font-bold text-white">Issue Estimator</h1>
                </div>
                <div className="text-gray-400 text-sm">
                  AI-Powered Analysis
                </div>
              </div>
            </div>
          </header>

          <main>
            {children}
          </main>

          {/* Footer */}
          <footer className="glass-effect border-t border-gray-800 mt-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex justify-between items-center text-gray-400 text-sm">
                <p>Transform issues into actionable tasks</p>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>AI Ready</span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}