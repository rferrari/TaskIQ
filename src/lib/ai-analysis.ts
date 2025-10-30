import { GitHubIssue } from '@/types';

export async function analyzeIssueWithAI(issue: GitHubIssue): Promise<any> {
  // For now, we'll use a mock analysis to test the flow
  // We'll integrate with OpenAI API later
  return mockAIAnalysis(issue);
}

function mockAIAnalysis(issue: GitHubIssue) {
  // Simple mock analysis based on issue content
  const title = issue.title.toLowerCase();
  const body = issue.body?.toLowerCase() || '';
  const labels = issue.labels.map(l => l.name.toLowerCase());
  
  let complexity = 2;
  let category = 'feature';
  let confidence = 0.8;
  
  // Simple heuristic-based analysis
  if (title.includes('bug') || labels.includes('bug')) {
    category = 'bug';
    complexity = title.includes('critical') ? 3 : 1;
  }
  
  if (title.includes('doc') || labels.includes('documentation')) {
    category = 'documentation';
    complexity = 1;
  }
  
  if (title.includes('refactor') || labels.includes('refactor')) {
    category = 'refactor';
    complexity = 2;
  }
  
  if (title.includes('enhancement') || labels.includes('enhancement')) {
    category = 'enhancement';
    complexity = 2;
  }
  
  // Adjust complexity based on body length and comments
  if (issue.body && issue.body.length > 500) complexity += 1;
  if (issue.comments > 5) complexity += 1;
  
  complexity = Math.min(Math.max(complexity, 1), 5);
  
  // Cost estimation based on complexity
  const costRanges = {
    1: '$10-$100',
    2: '$100-$250',
    3: '$250-$500', 
    4: '$500-$750',
    5: '$750-$900'
  };
  
  return {
    complexity,
    estimated_cost: costRanges[complexity as keyof typeof costRanges],
    category,
    confidence: Math.min(confidence + (Math.random() * 0.2), 0.95),
    key_factors: ['Issue description clarity', 'Label categorization'],
    potential_risks: ['Scope may be unclear'],
    recommended_actions: ['Review requirements with team'],
    ai_analysis: `This appears to be a ${category} issue with ${getComplexityText(complexity)} complexity.`
  };
}

function getComplexityText(complexity: number): string {
  const levels = ['trivial', 'simple', 'moderate', 'complex', 'very complex'];
  return levels[complexity - 1] || 'moderate';
}