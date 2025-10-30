import { OpenAI } from 'openai';
import { GitHubIssue } from '@/types';
import { 
  config, 
  getModelConfig, 
  estimateAnalysisCost, 
  getCostRange,
  getOpenAIConfig, 
  validateEnvironment, 
  getSummarizationSystemPrompt, 
  getAnalysisSystemPrompt 
} from '@/config';

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

// Initialize OpenAI client with validated config
const openAIConfig = getOpenAIConfig();
const openai = new OpenAI({
  apiKey: openAIConfig.apiKey,
  baseURL: openAIConfig.baseURL,
});

// Validate environment at startup
const envValidation = validateEnvironment();
if (envValidation.warnings.length > 0) {
  console.warn('⚠️ Environment warnings:', envValidation.warnings);
}

console.log('🤖 AI Service Initialized with Multi-Stage Pipeline');
console.log(`   Strategy: Small → Regular → Large with Summarization`);
console.log(`   Cost Optimization: ${config.features.enableCostOptimization ? 'Enabled' : 'Disabled'}`);

/** --- UTILITIES --- **/

function parseAIResponse(raw: string): any {
  console.log(`🔄 Parsing AI response...`);
  
  let cleaned = raw.trim()
    .replace(/```json\s*/g, '')
    .replace(/```/g, '')
    .replace(/^json\s*/i, '')
    .trim();

  console.log(`🔄 Cleaned response preview: ${cleaned.substring(0, 200)}...`);

  try { 
    const result = JSON.parse(cleaned);
    console.log(`✅ Successfully parsed JSON directly`);
    return result;
  } catch (firstError) {
    console.warn(`⚠️ Direct parse failed, trying to extract JSON...`);
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { 
      const result = JSON.parse(jsonMatch[0]);
      console.log(`✅ Successfully extracted and parsed JSON`);
      return result;
    } catch (secondError: any) {
      console.error(`❌ JSON extraction failed:`, secondError.message);
      console.error(`❌ Failed content:`, jsonMatch[0].substring(0, 500));
    }
  }

  throw new Error('Failed to parse AI response: No valid JSON found');
}

export function getFallbackAnalysis(issue: GitHubIssue): AIModelResponse {
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

  return {
    complexity,
    estimated_cost: getCostRange(complexity),
    category,
    confidence,
    key_factors: ['Fallback analysis', 'Basic heuristics'],
    potential_risks: ['Analysis may be less accurate'],
    recommended_actions: ['Review requirements carefully'],
    ai_analysis: `Fallback analysis: This appears to be a ${category} issue.`
  };
}

function validateAIResponse(parsed: any): AIModelResponse {
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

// For development/testing without API keys
export function mockAnalyzeIssue(issue: GitHubIssue): AIModelResponse {
  console.log(`🤖 USING MOCK ANALYSIS for issue #${issue.number}`);
  
  const analysis = getFallbackAnalysis(issue);
  
  // Add some randomness to make it feel more realistic
  analysis.confidence = Math.min(0.7 + (Math.random() * 0.25), 0.95);
  analysis.ai_analysis = `Mock AI analysis: This ${analysis.category} issue has ${['minimal', 'moderate', 'significant'][analysis.complexity - 1]} complexity.`;
  
  console.log(`🎭 MOCK ANALYSIS RESULT for issue #${issue.number}:`);
  console.log(JSON.stringify(analysis, null, 2));
  
  return analysis;
}

/** --- TOKEN ESTIMATION & STRATEGY --- **/

// Rough token estimation (4 chars ≈ 1 token for English text)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function selectAnalysisStrategy(issue: GitHubIssue): {
  model: string;
  needsSummarization: boolean;
  estimatedCost: number;
  modelConfig: any;
} {
  const issueContent = `${issue.title} ${issue.body || ''}`;
  const totalTokens = estimateTokens(issueContent);
  
  const smallModel = getModelConfig('small');
  const regularModel = getModelConfig('regular');
  const largeModel = getModelConfig('large');

  // Check if issue is too large to process
  if (totalTokens > config.ai.maxIssueTokens) {
    console.warn(`⚠️ Issue #${issue.number} exceeds maximum token limit (${totalTokens} > ${config.ai.maxIssueTokens})`);
    // Fall back to small model with forced summarization
    return {
      model: smallModel.id,
      needsSummarization: true,
      estimatedCost: estimateAnalysisCost(totalTokens, smallModel),
      modelConfig: smallModel
    };
  }

  // If it fits in small model with room for analysis, use it
  if (totalTokens < smallModel.maxContext * 0.7) {
    return {
      model: smallModel.id,
      needsSummarization: false,
      estimatedCost: estimateAnalysisCost(totalTokens, smallModel),
      modelConfig: smallModel
    };
  }

  // If it fits in regular model with room for analysis, use it
  if (totalTokens < regularModel.maxContext * 0.7) {
    return {
      model: regularModel.id,
      needsSummarization: false,
      estimatedCost: estimateAnalysisCost(totalTokens, regularModel),
      modelConfig: regularModel
    };
  }

  // Large issues need summarization first with large model
  return {
    model: largeModel.id,
    needsSummarization: true,
    estimatedCost: estimateAnalysisCost(totalTokens, largeModel),
    modelConfig: largeModel
  };
}

/** --- STAGE 1: SUMMARIZATION --- **/

export async function createIssueSummary(issue: GitHubIssue): Promise<string> {
  console.log(`📝 Stage 1: Creating summary for issue #${issue.number}`);
  
  const issueContent = `
ISSUE #${issue.number}: ${issue.title}
LABELS: ${issue.labels.map(l => l.name).join(', ') || 'None'}
COMMENTS: ${issue.comments}
DESCRIPTION: ${issue.body || 'No description provided'}
  `.trim();

  const currentTokens = estimateTokens(issueContent);
  const targetTokens = config.ai.summaryTargetTokens;
  
  if (currentTokens <= targetTokens) {
    console.log(`✅ Issue #${issue.number} already fits target (${currentTokens} tokens)`);
    return issueContent;
  }

  console.log(`🔄 Summarizing issue #${issue.number} from ${currentTokens} to ~${targetTokens} tokens`);

  // Much simpler user prompt - system prompt contains all instructions
  const userPrompt = `Please summarize this GitHub issue for cost estimation:\n\n${issueContent}`;

  try {
    const smallModel = getModelConfig('small');
    const completion = await openai.chat.completions.create({
      model: smallModel.id,
      messages: [
        {
          role: "system",
          content: getSummarizationSystemPrompt()
        },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: targetTokens,
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) throw new Error('No summary generated');

    const summaryTokens = estimateTokens(summary);
    console.log(`✅ Summary created: ${summaryTokens} tokens`);
    console.log(`📋 Summary preview: ${summary.substring(0, 200)}...`);

    return summary;
  } catch (error) {
    console.error(`❌ Summarization failed for issue #${issue.number}:`, error);
    // Fallback: truncate the original content
    return issueContent.substring(0, config.ai.summaryTargetTokens * 4) + '...';
  }
}

/** --- STAGE 2: ANALYSIS --- **/

export async function analyzeWithModel(model: string, issue: GitHubIssue, summary: string): Promise<AIModelResponse> {
  console.log(`🔍 Stage 2: Analyzing with ${model}`);

  // Simple user prompt - system prompt contains all analysis parameters
  const userPrompt = `Please analyze this GitHub issue summary and provide a cost estimation:\n\n${summary}`;

  try {
    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: getAnalysisSystemPrompt() // Now dynamically includes current cost ranges
        },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: config.ai.analysisMaxTokens,
      response_format: { type: "json_object" }
    });
    const endTime = Date.now();

    console.log(`⏱️ Analysis with ${model} took: ${endTime - startTime}ms`);

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error('No analysis response');

    console.log(`🤖 ${model} analysis response:`, response);

    return validateAIResponse(JSON.parse(response));
  } catch (error: any) {
    console.error(`❌ Analysis failed with ${model}:`, error.message);
    throw error;
  }
}

/** --- MAIN PIPELINE --- **/

export async function analyzeIssueWithAI(
  issue: GitHubIssue
): Promise<AIModelResponse> {
  
  console.log(`\n🎯 STARTING ANALYSIS PIPELINE for issue #${issue.number}`);
  console.log(`📊 Issue: "${issue.title}"`);
  console.log(`🏷️ Labels: ${issue.labels.map(l => l.name).join(', ')}`);
  console.log(`💬 Comments: ${issue.comments}`);
  console.log(`📝 Body length: ${issue.body?.length || 0} chars`);
    
  // Stage 0: Strategy Selection
  const strategy = selectAnalysisStrategy(issue);
  console.log(`⚡ Selected strategy:`, {
    model: strategy.model,
    needsSummarization: strategy.needsSummarization,
    estimatedCost: `$${strategy.estimatedCost.toFixed(6)}`,
    reason: strategy.needsSummarization ? 'Large issue requiring summarization' : 'Fits directly in selected model'
  });

  try {
    // Stage 1: Summarization (if needed)
    const analysisContent = strategy.needsSummarization 
      ? await createIssueSummary(issue)
      : `
ISSUE #${issue.number}: ${issue.title}
LABELS: ${issue.labels.map(l => l.name).join(', ') || 'None'} 
COMMENTS: ${issue.comments}
DESCRIPTION: ${issue.body || 'No description provided'}
      `.trim();

    // Stage 2: Analysis with selected model
    console.log(`🔍 Beginning analysis with ${strategy.model}...`);
    const analysis = await analyzeWithModel(strategy.model, issue, analysisContent);

    console.log(`🎉 ANALYSIS COMPLETE for issue #${issue.number}`);
    console.log(`📈 Result: Complexity ${analysis.complexity}, Cost: ${analysis.estimated_cost}, Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);

    return analysis;
    
  } catch (error) {
    console.error(`🔴 PIPELINE FAILED for issue #${issue.number}, using fallback`);
    return getFallbackAnalysis(issue);
  }
}