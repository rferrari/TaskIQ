import { OpenAI } from 'openai';
import { GitHubIssue } from '@/types';

interface AIModelResponse {
  complexity: number;
  estimated_cost: string;
  category: string;
  confidence: number;
  key_factors: string[];
  potential_risks: string[];
  recommended_actions: string[];
  ai_analysis: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL,
});

/** Collects all fallback models defined in .env */
const availableModels = Object.entries(process.env)
  .filter(([key]) => key.startsWith('OPENAI_LLM_MODEL'))
  .map(([_, value]) => value!)
  .filter(Boolean);

console.log('🤖 Available LLM Models:', availableModels);

/** --- UTILITIES --- **/

function parseAIResponse(raw: string): any {
  let cleaned = raw.trim()
    .replace(/```json\s*/g, '')
    .replace(/```/g, '')
    .replace(/^json\s*/i, '')
    .trim();

  try { return JSON.parse(cleaned); } catch { }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch { }
  }

  throw new Error('Failed to parse AI response');
}

function getFallbackAnalysis(issue: GitHubIssue): AIModelResponse {
  // Simple fallback analysis when all AI models fail
  const title = issue.title.toLowerCase();
  const body = issue.body?.toLowerCase() || '';
  const labels = issue.labels.map(l => l.name.toLowerCase());
  
  let complexity = 2;
  let category = 'feature';
  let confidence = 0.7;
  
  // Basic heuristic analysis
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

  // Adjust based on content
  if (issue.body && issue.body.length > 1000) complexity += 1;
  if (issue.comments > 10) complexity += 1;
  
  complexity = Math.min(Math.max(complexity, 1), 5);

  const costRanges = {
    1: '$100-$250',
    2: '$250-$500',
    3: '$500-$750', 
    4: '$750-$1000',
    5: '$1000-$1500'
  };

  return {
    complexity,
    estimated_cost: costRanges[complexity as keyof typeof costRanges],
    category,
    confidence,
    key_factors: ['Fallback analysis', 'Basic heuristics'],
    potential_risks: ['Analysis may be less accurate'],
    recommended_actions: ['Review requirements carefully'],
    ai_analysis: `Fallback analysis: This appears to be a ${category} issue.`
  };
}

/** --- AI ANALYSIS LOGIC --- **/

async function tryAnalyzeWithModel(model: string, issue: GitHubIssue): Promise<AIModelResponse> {
  const prompt = createAnalysisPrompt(issue);
  
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are an expert software engineer and project estimator. Always respond with valid JSON. Be realistic in your assessments."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1500,
      response_format: { type: "json_object" } // Force JSON mode if available
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error('No response from AI');

    const parsed = parseAIResponse(response);
    return validateAIResponse(parsed);
  } catch (error: any) {
    console.warn(`AI model ${model} failed:`, error.message);
    throw error; // Re-throw to handle in the main loop
  }
}

function createAnalysisPrompt(issue: GitHubIssue): string {
  return `
Analyze this GitHub issue and estimate development complexity and cost.

ISSUE #${issue.number}: ${issue.title}
DESCRIPTION: ${issue.body?.substring(0, 1500) || 'No description provided'}
LABELS: ${issue.labels.map(l => l.name).join(', ')}
COMMENTS: ${issue.comments}
CREATED: ${issue.created_at}

Please analyze this issue and provide your assessment in JSON format:

{
  "complexity": 1-5,
  "estimated_cost": "$XXX-XXX",
  "category": "bug|feature|documentation|enhancement|refactor",
  "confidence": 0.1-1.0,
  "key_factors": ["factor1", "factor2", "factor3"],
  "potential_risks": ["risk1", "risk2"],
  "recommended_actions": ["action1", "action2"],
  "ai_analysis": "Brief reasoning for the assessment"
}

Complexity Scale:
1: Trivial (1-2 hours) - Simple bugs, documentation updates
2: Simple (2-8 hours) - Minor features, CSS changes, small enhancements
3: Moderate (1-3 days) - Multi-component features, moderate refactoring
4: Complex (3-10 days) - Complex features, API integrations, major refactoring
5: Very Complex (2+ weeks) - Major features, architectural changes, complex integrations

Cost Ranges (adjust based on complexity):
1: $100-$250
2: $250-$500
3: $500-$750
4: $750-$1000
5: $1000-$1500

Be realistic in your assessment. Consider:
- Issue description clarity and detail
- Labels and their meanings
- Number of comments (indicates discussion complexity)
- Potential technical challenges
- Testing requirements
- Documentation needs

Respond with valid JSON only:
`;
}

function validateAIResponse(parsed: any): AIModelResponse {
  // Validate required fields
  const required = ['complexity', 'estimated_cost', 'category', 'confidence'];
  for (const field of required) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return {
    complexity: Math.min(Math.max(parseInt(parsed.complexity), 1), 5),
    estimated_cost: parsed.estimated_cost,
    category: parsed.category.toLowerCase(),
    confidence: Math.min(Math.max(parseFloat(parsed.confidence), 0.1), 1.0),
    key_factors: parsed.key_factors || [],
    potential_risks: parsed.potential_risks || [],
    recommended_actions: parsed.recommended_actions || [],
    ai_analysis: parsed.ai_analysis || 'AI analysis provided'
  };
}

/** --- PUBLIC API --- **/

export async function analyzeIssueWithAI(
  issue: GitHubIssue
): Promise<AIModelResponse> {

  // If no models are configured, use fallback immediately
  if (availableModels.length === 0) {
    console.warn('⚠️ No AI models configured, using fallback analysis');
    return getFallbackAnalysis(issue);
  }

  // Iterate over models sequentially
  for (const model of availableModels) {
    try {
      console.log(`🧠 Analyzing issue #${issue.number} with model: ${model}`);
      const analysis = await tryAnalyzeWithModel(model, issue);
      console.log(`✅ Success with model: ${model} for issue #${issue.number}`);
      return analysis;
    } catch (error: any) {
      console.warn(`⚠️ Model ${model} failed for issue #${issue.number}: ${error.message}`);
      
      // Handle rate limit separately
      if (error.status === 429) {
        console.warn(`⏳ Rate limit on ${model}, trying next...`);
        continue;
      }
      
      // For other errors, wait a bit and try next model
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
  }

  // If all models failed
  console.error(`🔴 All models failed for issue #${issue.number}, using fallback`);
  return getFallbackAnalysis(issue);
}

// For development/testing without API keys
export function mockAnalyzeIssue(issue: GitHubIssue): AIModelResponse {
  const analysis = getFallbackAnalysis(issue);
  
  // Add some randomness to make it feel more realistic
  analysis.confidence = Math.min(0.7 + (Math.random() * 0.25), 0.95);
  analysis.ai_analysis = `Mock AI analysis: This ${analysis.category} issue has ${['minimal', 'moderate', 'significant'][analysis.complexity - 1]} complexity.`;
  
  return analysis;
}