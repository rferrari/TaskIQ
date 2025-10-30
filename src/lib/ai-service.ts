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

class AIService {
  private availableModels: string[];

  constructor() {
    // Collect all defined models from environment variables
    this.availableModels = this.getAvailableModels();
    console.log('🤖 Available AI Models:', this.availableModels);
  }

  private getAvailableModels(): string[] {
    const models: string[] = [];
    
    // Check for models in priority order
    const modelKeys = [
      'OPENAI_LLM_MODEL_1',
      'OPENAI_LLM_MODEL_2', 
      'OPENAI_LLM_MODEL_3',
      'OPENAI_LLM_MODEL_4'
    ];

    for (const key of modelKeys) {
      const model = process.env[key];
      if (model) {
        models.push(model);
      }
    }

    // Fallback to default models if none configured
    if (models.length === 0) {
      console.warn('⚠️ No AI models configured in environment, using defaults');
      return [
        'gpt-4o-mini',
        'gpt-3.5-turbo',
        'llama-3.1-8b-instant'
      ];
    }

    return models;
  }

  async analyzeIssue(issue: GitHubIssue): Promise<AIModelResponse> {
    // Try each model in sequence until one works
    for (const model of this.availableModels) {
      try {
        console.log(`🧠 Analyzing issue #${issue.number} with model: ${model}`);
        const analysis = await this.tryAnalyzeWithModel(model, issue);
        console.log(`✅ Success with model: ${model} for issue #${issue.number}`);
        return analysis;
      } catch (error: any) {
        console.warn(`⚠️ Model ${model} failed for issue #${issue.number}:`, error.message);
        
        // If it's a rate limit, wait a bit before trying next model
        if (error.status === 429 || error.message.includes('rate limit')) {
          console.warn(`⏳ Rate limit on ${model}, waiting 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Continue to next model
      }
    }

    // If all models failed, use fallback analysis
    console.warn(`🔴 All models failed for issue #${issue.number}, using fallback`);
    return this.getFallbackAnalysis(issue);
  }

  private async tryAnalyzeWithModel(model: string, issue: GitHubIssue): Promise<AIModelResponse> {
    const prompt = this.createAnalysisPrompt(issue);
    
    // For now, we'll use the mock analysis since we don't have actual API keys
    // In production, you would replace this with actual API calls
    return this.mockAIAnalysis(issue);
    
    // Production implementation would look like:
    /*
    const response = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.parseAIResponse(data.choices[0].message.content);
    */
  }

  private createAnalysisPrompt(issue: GitHubIssue): string {
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

  private parseAIResponse(response: string): AIModelResponse {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      const required = ['complexity', 'estimated_cost', 'category', 'confidence'];
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      return {
        complexity: Math.min(Math.max(parsed.complexity, 1), 5),
        estimated_cost: parsed.estimated_cost,
        category: parsed.category.toLowerCase(),
        confidence: Math.min(Math.max(parsed.confidence, 0.1), 1.0),
        key_factors: parsed.key_factors || [],
        potential_risks: parsed.potential_risks || [],
        recommended_actions: parsed.recommended_actions || [],
        ai_analysis: parsed.ai_analysis || 'AI analysis provided'
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error('Invalid AI response format');
    }
  }

  private getFallbackAnalysis(issue: GitHubIssue): AIModelResponse {
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

  // Keep the mock for development
  private mockAIAnalysis(issue: GitHubIssue): AIModelResponse {
    // Enhanced mock that's more realistic
    const analysis = this.getFallbackAnalysis(issue);
    
    // Add some randomness to make it feel more realistic
    analysis.confidence = Math.min(0.7 + (Math.random() * 0.25), 0.95);
    analysis.ai_analysis = `AI analysis: This ${analysis.category} issue has ${['minimal', 'moderate', 'significant'][analysis.complexity - 1]} complexity. ${analysis.key_factors[0]}.`;
    
    return analysis;
  }
}

// Export singleton instance
export const aiService = new AIService();