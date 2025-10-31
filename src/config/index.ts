// src/config/index.ts
// Central configuration for the entire application
export interface ModelConfig {
  id: string;
  type: 'small' | 'regular' | 'large';
  maxContext: number;
  maxCompletion: number;
  priceInput: number;
  priceOutput: number;
  speed: string;
  tpm: number;
  description: string;
}

export interface AppConfig {
  ai: {
    smallModel: ModelConfig;
    regularModel: ModelConfig;
    largeModel: ModelConfig;
    summaryTargetTokens: number;
    analysisMaxTokens: number;
    maxIssueTokens: number;
    batchSize: number;
    requestDelay: number;
    // Move cost ranges to main config
    costRanges: Record<number, string>;
  };
  ui: {
    defaultTheme: 'dark';
    resultsPerPage: number;
    enableCostTracking: boolean;
    tableSortOptions: { [key: string]: string };
    complexityFilterOptions: { [key:string]: string };
  };
  features: {
    enableCaching: boolean;
    enableProgressTracking: boolean;
    enableCostOptimization: boolean;
  };
}

// Default model configurations - easily tweakable in one place
const DEFAULT_MODELS: Record<string, ModelConfig> = {
  small: {
    id: 'llama-3.1-8b-instant',
    type: 'small',
    maxContext: 6000,
    maxCompletion: 4096,
    priceInput: 0.05,
    priceOutput: 0.08,
    tpm: 6000,
    speed: '560 T/SEC',
    description: 'Fast & cheap - ideal for simple issues and summarization'
  },
  regular: {
    id: 'openai/gpt-oss-20b',
    type: 'regular',
    maxContext: 500,
    maxCompletion: 4096,
    priceInput: 0.075,
    priceOutput: 0.30,
    tpm: 8000,
    speed: '1000 T/SEC',
    description: 'Balanced - good for medium complexity issues'
  },
  large: {
    id: 'llama-3.3-70b-versatile',
    type: 'large',
    maxContext: 200,
    maxCompletion: 4096,
    priceInput: 0.59,
    priceOutput: 0.79,
    tpm: 12000,
    speed: '280 T/SEC',
    description: 'Powerful - best for complex issues requiring deep analysis'
  }
};

// Main application configuration
export const config: AppConfig = {
  ai: {
    // Model configurations
    smallModel: DEFAULT_MODELS.small,
    regularModel: DEFAULT_MODELS.regular,
    largeModel: DEFAULT_MODELS.large,
    
    // Cost ranges - now centralized in config
    costRanges: {
      1: '$20-$50',
      2: '$50-$120',
      3: '$120-$300', 
      4: '$300-$600',
      5: '$600-$1000'
    },
    
    // Token management
    summaryTargetTokens: 1500,
    analysisMaxTokens: 2000,
    maxIssueTokens: 25000,
    
    // Performance tuning
    batchSize: 25,
    requestDelay: 2000, // ms between API calls
  },
  ui: {
    defaultTheme: 'dark',
    resultsPerPage: 50,
    enableCostTracking: true,
    tableSortOptions: {
      complexity: 'Complexity',
      estimated_cost: 'Cost',
      confidence: 'Confidence'
    },
    complexityFilterOptions: {
      all: 'All Complexities',
      Trivial: 'Trivial',
      Simple: 'Simple',
      Moderate: 'Moderate',
      Complex: 'Complex',
      'Very Complex': 'Very Complex'
    }
  },
  features: {
    enableCaching: true,
    enableProgressTracking: true,
    enableCostOptimization: true,
  },
};

// Helper function to get model by type
export function getModelConfig(type: 'small' | 'regular' | 'large'): ModelConfig {
  return config.ai[`${type}Model`];
}

// Helper function to estimate cost for analysis
export function estimateAnalysisCost(tokens: number, model: ModelConfig): number {
  return (tokens / 1000000) * model.priceInput;
}

// Helper function to get cost ranges as formatted string for prompts
export function getCostRangesPrompt(): string {
  return Object.entries(config.ai.costRanges)
    .map(([complexity, range]) => `${complexity}: ${range}`)
    .join('\n');
}

// Helper to get cost range for a specific complexity
export function getCostRange(complexity: number): string {
  return config.ai.costRanges[complexity] || '$0-$0';
}

export function validateEnvironment(): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check required environment variables
  if (!process.env.OPENAI_API_KEY) {
    warnings.push('OPENAI_API_KEY is not set - AI features will use mock data');
  }
  
  if (!process.env.OPENAI_BASE_URL) {
    warnings.push('OPENAI_BASE_URL is not set - using default Groq endpoint');
  }
  
  // Check for deprecated environment variables
  const deprecatedVars = [
    'OPENAI_LLM_MODEL_1', 'OPENAI_LLM_MODEL_2', 'OPENAI_LLM_MODEL_3',
    'OPENAI_LLM_MODEL_4', 'OPENAI_LLM_MODEL_5', 'OPENAI_LLM_MODEL_6'
  ];
  
  const usedDeprecated = deprecatedVars.filter(key => process.env[key]);
  if (usedDeprecated.length > 0) {
    warnings.push(`Deprecated environment variables found: ${usedDeprecated.join(', ')}. Using centralized config instead.`);
  }
  
  // Validate model configurations
  const models = [config.ai.smallModel, config.ai.regularModel, config.ai.largeModel];
  for (const model of models) {
    if (model.maxCompletion > model.maxContext) {
      warnings.push(`Model ${model.id}: maxCompletion (${model.maxCompletion}) exceeds maxContext (${model.maxContext})`);
    }
  }
  
  // Validate cost ranges
  for (let i = 1; i <= 5; i++) {
    if (!config.ai.costRanges[i]) {
      warnings.push(`Missing cost range for complexity level ${i}`);
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

export function getOpenAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1',
  };
}

/** --- DYNAMIC SYSTEM PROMPTS --- **/

// Generate system prompts dynamically to include current config values
export function getSummarizationSystemPrompt(): string {
  return `You are a technical analyst specializing in creating concise summaries for software development estimation.

Your role:
- Extract key technical details from GitHub issues
- Focus on information needed for accurate cost estimation
- Maintain factual accuracy while being concise
- Identify complexity indicators, dependencies, and technical requirements

CRITICAL: Keep summaries under ${config.ai.summaryTargetTokens} tokens. Focus on:
• Core functionality to implement/fix
• Technical complexity indicators  
• Dependencies and integration points
• Testing requirements
• Mentioned technologies or frameworks

Respond with ONLY the concise summary, no additional commentary.`;
}

export function getAnalysisSystemPrompt(): string {
  const costRangesText = getCostRangesPrompt();
  
  return `You are an expert software engineer and project estimator specializing in GitHub issue analysis.

ROLE: Analyze software development issues and provide realistic assessments for project planning.

COMPLEXITY SCALE:
1: Trivial (1-2 hours) - Simple bugs, docs, minor text changes
2: Simple (2-8 hours) - Minor features, CSS changes, small enhancements  
3: Moderate (1-3 days) - Multi-component features, API integrations
4: Complex (3-10 days) - Complex features, database changes, major refactoring
5: Very Complex (2+ weeks) - Major features, architectural changes

COST RANGES (based on complexity):
${costRangesText}

CATEGORIES:
- bug: Fixing broken functionality
- feature: Adding new functionality  
- enhancement: Improving existing functionality
- documentation: Documentation changes only
- refactor: Code restructuring without changing behavior

ASSESSMENT GUIDELINES:
- Evaluate technical complexity realistically
- Consider testing and documentation needs
- Account for integration challenges and dependencies
- Assess risk factors and potential unknowns
- Be conservative in confidence scoring

RESPONSE FORMAT: You MUST respond with valid JSON using this exact structure:
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

CRITICAL: Always respond with valid JSON only. No additional text.`;
}

// Log configuration at startup
console.log('⚙️ Application Configuration Loaded:');
console.log(`   Small Model: ${config.ai.smallModel.id} (${config.ai.smallModel.description})`);
console.log(`   Regular Model: ${config.ai.regularModel.id} (${config.ai.regularModel.description})`);
console.log(`   Large Model: ${config.ai.largeModel.id} (${config.ai.largeModel.description})`);
console.log(`   Summary Target: ${config.ai.summaryTargetTokens} tokens`);
console.log(`   Analysis Max: ${config.ai.analysisMaxTokens} tokens`);
console.log(`   Cost Ranges:`, config.ai.costRanges);