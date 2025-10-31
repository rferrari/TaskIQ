import { OpenAI } from 'openai';
import { AnalysisProgressType, GitHubIssue } from '@/types';
import { tpmLimiter } from '@/lib/rate-limiter';

// Use proper OpenAI message types
type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

import { 
  config, 
  getModelConfig, 
  estimateAnalysisCost, 
  getCostRange,
  getOpenAIConfig, 
  validateEnvironment, 
  getSummarizationSystemPrompt, 
  getAnalysisSystemPrompt, 
  ModelConfig
} from '@/config';
import { tokenBalancer } from './advanced-balancer';

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
function getModelConfigById(modelId: string): ModelConfig | null {
  // Check all configured models
  const models = [config.ai.smallModel, config.ai.regularModel, config.ai.largeModel];
  return models.find(model => model.id === modelId) || null;
}

// async function withAbortSignal<T>(
//   operation: (signal: AbortSignal) => Promise<T>,
//   /** parentSignal is ignored – we never add listeners to it */
//   _parentSignal?: AbortSignal
// ): Promise<T> {
//   const controller = new AbortController();

//   try {
//     return await operation(controller.signal);
//   } finally {
//     // always cancel any pending fetch / openai call
//     controller.abort();
//   }
// }

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
  model: string; // Now returns the actual model ID
  needsSummarization: boolean;
  estimatedCost: number;
  modelConfig: ModelConfig;
} {
  const issueContent = `${issue.title} ${issue.body || ''}`;
  const totalTokens = estimateTokens(issueContent);
  
  console.log(`📊 Issue #${issue.number} token estimate: ${totalTokens}`);

  // Enforce token limit
  if (totalTokens > config.ai.maxIssueTokens) {
    console.log(`⚠️ Issue #${issue.number} exceeds ${config.ai.maxIssueTokens} token limit, forcing summarization`);
    const smallModel = getModelConfig('small');
    return {
      model: smallModel.id, // Return actual model ID
      needsSummarization: true,
      estimatedCost: estimateAnalysisCost(config.ai.maxIssueTokens, smallModel),
      modelConfig: smallModel
    };
  }

  // Normal strategy selection
  const smallModel = getModelConfig('small');
  const regularModel = getModelConfig('regular');
  const largeModel = getModelConfig('large');

  if (totalTokens < largeModel.maxContext * 0.6) {
    // Large issues need summarization
    return {
      model: largeModel.id, // Return actual model ID
      needsSummarization: true,
      estimatedCost: estimateAnalysisCost(totalTokens, largeModel),
      modelConfig: largeModel
    };
  }

  if (totalTokens < regularModel.maxContext * 0.6) {
    return {
      model: regularModel.id, // Return actual model ID
      needsSummarization: false,
      estimatedCost: estimateAnalysisCost(totalTokens, regularModel),
      modelConfig: regularModel
    };
  }

  return {
      model: smallModel.id, // Return actual model ID
      needsSummarization: false,
      estimatedCost: estimateAnalysisCost(totalTokens, smallModel),
      modelConfig: smallModel
    };
}

/** --- STAGE 1: SUMMARIZATION --- **/
// ✅ Enhanced createIssueSummary function (fully fixed and refactored)
export async function createIssueSummary(
  issue: GitHubIssue,
  // parentAbortSignal?: AbortSignal
): Promise<string> {
  console.log(`📝 Stage 1: Creating summary for issue #${issue.number}`);

  // return withAbortSignal(async (signal) => {
    const issueContent = `
ISSUE #${issue.number}: ${issue.title}
LABELS: ${issue.labels.map((l) => l.name).join(", ") || "None"}
COMMENTS: ${issue.comments}
STATE: ${issue.state}
CREATED: ${issue.created_at}
DESCRIPTION: ${issue.body || "No description provided"}
`.trim();

    const currentTokens = estimateTokens(issueContent);
    const targetTokens = config.ai.summaryTargetTokens;

    // Skip summarization if already short enough
    if (currentTokens <= targetTokens) {
      console.log(`✅ Issue #${issue.number} fits target (${currentTokens} tokens)`);
      return issueContent;
    }

    console.log(
      `🔄 Summarizing issue #${issue.number} from ${currentTokens} → ~${targetTokens} tokens`
    );

    const trimmedContent = smartTrimIssueContent(issueContent, targetTokens * 3);
    const userPrompt = `Please create a concise technical summary of this GitHub issue for cost estimation analysis:\n\n${trimmedContent}`;

    try {
      const smallModel = getModelConfig("small");

      // Prepare messages for summarization
      const messages: OpenAIMessage[] = [
        { role: "system", content: getSummarizationSystemPrompt() },
        { role: "user", content: userPrompt },
      ];

      // Check and respect TPM limit
      const estimatedTokens = tpmLimiter.estimateRequestTokens(messages, smallModel);
      await tpmLimiter.checkAndWait(smallModel.id, estimatedTokens);

      // Run OpenAI completion
      const completion = await openai.chat.completions.create(
        {
          model: smallModel.id,
          messages,
          temperature: 0.1,
          max_tokens: targetTokens,
        },
        // { signal }
      );

      const summary = completion.choices[0]?.message?.content?.trim();
      if (!summary) throw new Error("No summary generated");

      const summaryTokens = estimateTokens(summary);
      console.log(`✅ Summary created: ${summaryTokens} tokens`);

      return summary;
    } catch (error: any) {
      // if (error.name === "AbortError" || parentAbortSignal?.aborted) {
      //   console.log(`🛑 Summarization for issue #${issue.number} was aborted`);
      //   throw error;
      // }

      console.error(`❌ Summarization failed for issue #${issue.number}:`, error);
      return trimmedContent;
    }
  // }, parentAbortSignal);
}

// Smart trimming function that combines noise removal and key extraction
function smartTrimIssueContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  console.log(`✂️ Trimming content from ${content.length} to ${maxChars} chars`);

  // Step 1: Remove common noise
  let cleaned = removeCommonNoise(content);
  
  // Step 2: If still too long, extract key sections
  if (cleaned.length > maxChars) {
    cleaned = extractKeySections(cleaned, maxChars);
  }
  
  // Step 3: Final truncation if needed
  if (cleaned.length > maxChars) {
    cleaned = cleaned.substring(0, maxChars - 100) + '\n\n...[Content truncated due to length]';
  }
  
  console.log(`✅ Trimmed to ${cleaned.length} chars`);
  return cleaned;
}

// Remove common noise patterns (logs, stack traces, etc.)
function removeCommonNoise(text: string): string {
  return text
    // Remove code blocks with logs
    .replace(/```[\s\S]*?```/g, ' [Code/logs removed] ')
    // Remove stack traces
    .replace(/\s+at\s+[^\n]+(\n\s+at\s+[^\n]+)*/g, ' [Stack trace removed] ')
    // Remove hex strings and long hashes
    .replace(/\b[0-9a-f]{16,}\b/gi, '[hex]')
    // Remove very long strings without spaces
    .replace(/\b\S{50,}\b/g, '[long_string]')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Extract the most important sections
function extractKeySections(text: string, maxChars: number): string {
  const sections: string[] = [];
  let currentLength = 0;
  
  // Look for important markers in order of importance
  const patterns = [
    // Problem description (most important)
    /(problem|issue|bug|error|what's wrong)[\s:]*\n?([^\n]{50,400})/gi,
    // Steps to reproduce
    /(steps? to reproduce|reproduce|reproduction)[\s:]*\n?([\s\S]{50,800})/gi,
    // Expected vs actual behavior
    /(expected|actual|current behavior)[\s:]*\n?([^\n]{30,300})/gi,
    // Error messages
    /(error|exception|fail)[\s:]*\n?([^\n]{20,200})/gi,
    // First substantial paragraph
    /^([^\n]{100,500})/,
  ];
  
  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      const content = (match[2] || match[1] || '').trim();
      if (content && currentLength + content.length <= maxChars * 0.9) {
        sections.push(content);
        currentLength += content.length;
      }
    }
  }
  
  // If we found good sections, use them with context
  if (sections.length > 0) {
    return `Key issue details:\n\n${sections.slice(0, 3).join('\n\n')}`;
  }
  
  // Fallback: first and last parts with context
  const firstPart = text.substring(0, Math.floor(maxChars * 0.6));
  const lastPart = text.substring(Math.max(0, text.length - Math.floor(maxChars * 0.3)));
  
  return `${firstPart}\n\n...[content omitted]...\n\n${lastPart}`;
}

/** --- STAGE 2: ANALYSIS --- **/
export async function analyzeWithModel(
  model: string, 
  issue: GitHubIssue, 
  summary: string,
  // parentAbortSignal?: AbortSignal
): Promise<AIModelResponse> {
  // return withAbortSignal(async (signal) => {
    console.log(`🔍 Starting analysis for issue #${issue.number} using ${model}`);
  
  // Create dedicated abort controller for this request
  const requestAbortController = new AbortController();
  
  // // Set up parent signal forwarding with proper cleanup
  // if (parentAbortSignal) {
  //   const handleParentAbort = () => {
  //     requestAbortController.abort();
  //     // Remove the listener to prevent leaks
  //     parentAbortSignal.removeEventListener('abort', handleParentAbort);
  //   };
  //   parentAbortSignal.addEventListener('abort', handleParentAbort);
  // }

  const modelConfig = getModelConfigById(model) || getModelConfig('small');
  
  const userPrompt = `Please analyze this GitHub issue summary and provide a cost estimation:\n\n${summary}`;

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: getAnalysisSystemPrompt()
    },
    {
      role: "user", 
      content: userPrompt 
    }
  ];

  try {
    // Check TPM limits
    const estimatedTokens = tpmLimiter.estimateRequestTokens(messages, modelConfig);
    await tpmLimiter.checkAndWait(model, estimatedTokens);

    console.log(`✅ TPM check passed for ${model}, proceeding with analysis...`);

    const startTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
      max_tokens: config.ai.analysisMaxTokens,
          response_format: { type: "json_object" },
        },
        // { signal }
      );
    
    const endTime = Date.now();
    console.log(`⏱️ Analysis with ${model} took: ${endTime - startTime}ms`);

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error('No analysis response');

    return validateAIResponse(JSON.parse(response));
  } catch (error: any) {
    requestAbortController.abort();

  console.error(`Analysis failed with ${model}:`, error.message);

  // 1. TPM / Rate limit → treat as "try next model"
  if (error.status === 429 || error.message.includes('TPM') || error.message.includes('rate limit')) {
    console.log(`Rate limit hit for ${model}, trying next model...`);
    throw error; // ← Let analyzeIssueWithAI try fallback
  }

  // 2. Size error → try smaller model (existing logic)
  if (error.status === 413 || error.message.includes('too large') || error.message.includes('token')) {
    console.log(`Size limit hit with ${model}, trying smaller model...`);
    const currentModelConfig = getModelConfigById(model);
    if (currentModelConfig) {
      if (currentModelConfig.type === 'large') {
        const fallback = getModelConfig('regular').id;
        console.log(`Falling back from large to regular: ${fallback}`);
        return await analyzeWithModel(fallback, issue, summary);
      } else if (currentModelConfig.type === 'regular') {
        const fallback = getModelConfig('small').id;
        console.log(`Falling back from regular to small: ${fallback}`);
        return await analyzeWithModel(fallback, issue, summary);
      }
    }
  }

  // 3. Other errors → rethrow
  throw error;
  }
  // }, parentAbortSignal);
}


/** --- MAIN PIPELINE --- **/

// Updated analyzeIssueWithAI function
export async function analyzeIssueWithAI(
  issue: GitHubIssue,
  progress?: AnalysisProgressType,
  sendProgress?: (p: AnalysisProgressType) => Promise<void>
): Promise<AIModelResponse> {
  
  console.log(`\nSTARTING BALANCED ANALYSIS PIPELINE for issue #${issue.number}`);
  
  const strategy = tokenBalancer.selectBalancedStrategy(issue);

  // UPDATE UI: Show selected model
  if (progress && sendProgress) {
    progress.issues[issue.number].currentStage = strategy.model;
    progress.issues[issue.number].status = 'analyzing';
    progress.issues[issue.number].progress = 75;
    await sendProgress(progress);
  }

  const startTime = Date.now();
  let finalModelUsed = strategy.model;

  try {
    const analysisContent = strategy.needsSummarization 
      ? await createIssueSummary(issue)
      : `ISSUE #${issue.number}: ${issue.title}\nDESCRIPTION: ${issue.body || 'No description'}`;

    let analysis: AIModelResponse;
    let lastError: Error | null = null;
    
    const modelsToTry = [strategy.model, ...strategy.fallbackModels];
    
    for (const model of modelsToTry) {
      try {
        // UPDATE UI: Show current model being tried
        if (progress && sendProgress) {
          progress.issues[issue.number].currentStage = model;
          await sendProgress(progress);
        }

        analysis = await analyzeWithModel(model, issue, analysisContent);
        finalModelUsed = model;
        break;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Analysis failed with ${model}, trying next...`);
        tokenBalancer.recordModelPerformance(model, Date.now() - startTime, false);
        
        if (model === modelsToTry[modelsToTry.length - 1]) {
          throw lastError;
        }
      }
    }

    const responseTime = Date.now() - startTime;
    tokenBalancer.recordModelPerformance(finalModelUsed, responseTime, true);

    // FINAL UI UPDATE
    if (progress && sendProgress) {
      progress.issues[issue.number].model = finalModelUsed;
      progress.issues[issue.number].status = 'complete';
      progress.issues[issue.number].progress = 100;
      progress.analyzedIssues++;
      await sendProgress(progress);
    }

    return analysis!;
    
  } catch (error) {
// FAILURE → FALLBACK
    tokenBalancer.recordModelPerformance(finalModelUsed, Date.now() - startTime, false);
    console.error(`BALANCED PIPELINE FAILED for issue #${issue.number}, using fallback`);

    const fallback = getFallbackAnalysis(issue);

    // UI: Show fallback model
    if (progress && sendProgress) {
      progress.issues[issue.number].model = 'fallback';
      progress.issues[issue.number].status = 'complete';
      progress.issues[issue.number].progress = 100;
      progress.analyzedIssues++;
      await sendProgress(progress);
    }

    return fallback;
  }
}