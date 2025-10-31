// src/lib/advanced-balancer.ts
import { ModelConfig, config } from '@/config';
import { tpmLimiter } from './rate-limiter';
import { GitHubIssue } from '@/types';

interface ModelLoad {
  modelId: string;
  currentUsage: number;
  capacity: number; // TPM limit
  availableCapacity: number;
  utilization: number; // 0-1
  avgResponseTime: number;
  errorRate: number;
  lastError?: string;
}

interface BalancedRequest {
  modelId: string;
  estimatedTokens: number;
  priority: 'high' | 'medium' | 'low';
  fallbackModels: string[];
}

class AdvancedTokenBalancer {
  private modelLoads: Map<string, ModelLoad> = new Map();
  private readonly updateInterval = 5000; // 5 seconds
  private readonly maxErrorRate = 0.1; // 10% error rate threshold
  private readonly highUtilizationThreshold = 0.8; // 80% utilization

  constructor() {
    this.initializeModelLoads();
    this.startLoadMonitoring();
  }

  private initializeModelLoads(): void {
    const models = [config.ai.smallModel, config.ai.regularModel, config.ai.largeModel];
    
    models.forEach(model => {
      this.modelLoads.set(model.id, {
        modelId: model.id,
        currentUsage: 0,
        capacity: model.tpm,
        availableCapacity: model.tpm,
        utilization: 0,
        avgResponseTime: 0,
        errorRate: 0
      });
    });
  }

  private startLoadMonitoring(): void {
    setInterval(() => {
      this.updateModelLoads();
    }, this.updateInterval);
  }

  private updateModelLoads(): void {
    for (const [modelId, load] of this.modelLoads) {
      const modelConfig = this.getModelConfigById(modelId);
      if (!modelConfig) continue;

      // Get current usage from TPM limiter
      const currentUsage = tpmLimiter.getUsage(modelId)
        .reduce((sum, usage) => sum + usage.tokens, 0);

      load.currentUsage = currentUsage;
      load.availableCapacity = Math.max(0, modelConfig.tpm - currentUsage);
      load.utilization = currentUsage / modelConfig.tpm;
      
      // Simulate response time based on utilization
      load.avgResponseTime = this.calculateEstimatedResponseTime(modelConfig, load.utilization);
    }
  }

  /**
   * CRITICAL FIX: Check both context limits AND TPM capacity
   */
  private getAvailableModels(estimatedTokens: number): ModelLoad[] {
    const available: ModelLoad[] = [];
    
    for (const [modelId, load] of this.modelLoads) {
      const modelConfig = this.getModelConfigById(modelId);
      if (!modelConfig) continue;

      // Check context window (with safety margin)
      const canHandleContext = estimatedTokens <= modelConfig.maxContext * 0.7; // 70% safety margin
      
      // Check TPM capacity (with safety buffer)
      const hasTPMCapacity = load.availableCapacity >= estimatedTokens * 1.2; // 20% buffer
      
      // Check health
      const isHealthy = load.errorRate <= this.maxErrorRate;

      console.log(`🔍 Model ${modelId} check:`, {
        context: `${estimatedTokens} <= ${modelConfig.maxContext * 0.7} = ${canHandleContext}`,
        tpm: `${estimatedTokens * 1.2} <= ${load.availableCapacity} = ${hasTPMCapacity}`,
        healthy: isHealthy,
        availableCapacity: load.availableCapacity
      });

      if (canHandleContext && hasTPMCapacity && isHealthy) {
        available.push(load);
      }
    }

    console.log(`✅ Available models for ${estimatedTokens} tokens:`, available.map(m => m.modelId));
    return available;
  }

  /**
   * IMPROVED: Better model selection with TPM awareness
   */
  public selectOptimalModel(
    estimatedTokens: number,
    complexityHint: 'low' | 'medium' | 'high' = 'medium',
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): BalancedRequest {
    const availableModels = this.getAvailableModels(estimatedTokens);
    
    if (availableModels.length === 0) {
      console.warn('❌ No models available with sufficient capacity, trying relaxed criteria...');
      
      // Fallback: try models that can at least handle the context, regardless of TPM
      const fallbackModels = this.getModelsByContextCapacity(estimatedTokens);
      if (fallbackModels.length === 0) {
        throw new Error(`No suitable models available for ${estimatedTokens} tokens`);
      }
      
      // Use the first model that can handle context, we'll handle TPM waiting separately
      const bestModel = fallbackModels[0];
      const otherModels = fallbackModels.slice(1).map(m => m.modelId);
      
      console.log(`⚠️ Using fallback model ${bestModel.modelId} with potential TPM waiting`);
      
      return {
        modelId: bestModel.modelId,
        estimatedTokens,
        priority,
        fallbackModels: otherModels
      };
    }

    // Score and select from available models
    const scoredModels = availableModels.map(model => ({
      model,
      score: this.calculateModelScore(model, estimatedTokens, complexityHint, priority)
    }));

    scoredModels.sort((a, b) => b.score - a.score);
    const bestModel = scoredModels[0].model;
    const fallbackModels = scoredModels.slice(1, 3).map(scored => scored.model.modelId);

    return {
      modelId: bestModel.modelId,
      estimatedTokens,
      priority,
      fallbackModels
    };
  }

  /**
   * NEW: Get models that can handle context regardless of TPM
   */
  private getModelsByContextCapacity(estimatedTokens: number): ModelLoad[] {
    const capable: ModelLoad[] = [];
    
    for (const [modelId, load] of this.modelLoads) {
      const modelConfig = this.getModelConfigById(modelId);
      if (!modelConfig) continue;

      if (estimatedTokens <= modelConfig.maxContext * 0.7) {
        capable.push(load);
      }
    }

    // Sort by capacity (descending)
    return capable.sort((a, b) => b.availableCapacity - a.availableCapacity);
  }

  private calculateModelScore(
    modelLoad: ModelLoad,
    estimatedTokens: number,
    complexityHint: string,
    priority: string
  ): number {
    const modelConfig = this.getModelConfigById(modelLoad.modelId);
    if (!modelConfig) return -1;

    let score = 0;

    // 1. Capacity score (40% weight) - prefer models with more headroom
    const capacityHeadroom = modelLoad.availableCapacity - estimatedTokens;
    const capacityScore = Math.min(1, Math.max(0, capacityHeadroom / modelConfig.tpm));
    score += capacityScore * 40;

    // 2. Cost efficiency score (20% weight)
    const costPerToken = (modelConfig.priceInput + modelConfig.priceOutput) / 2;
    const costScore = 1 - Math.min(1, costPerToken / 0.5);
    score += costScore * 20;

    // 3. Performance score (20% weight)
    const performanceScore = 1 - Math.min(1, modelLoad.avgResponseTime / 15000);
    score += performanceScore * 20;

    // 4. Complexity matching (20% weight)
    const complexityMatch = this.getComplexityMatchScore(modelConfig.type, complexityHint);
    score += complexityMatch * 20;

    // 5. Priority adjustments
    if (priority === 'high') {
      const speedBonus = 1 - Math.min(1, modelLoad.avgResponseTime / 8000);
      score += speedBonus * 15;
    } else if (priority === 'low') {
      score += costScore * 15;
    }

    // Penalties
    if (modelLoad.utilization > this.highUtilizationThreshold) {
      score *= (1 - (modelLoad.utilization - this.highUtilizationThreshold));
    }

    if (modelLoad.errorRate > this.maxErrorRate) {
      score *= (1 - modelLoad.errorRate);
    }

    return Math.max(0, score);
  }

  private getComplexityMatchScore(modelType: string, complexityHint: string): number {
    const complexityMatrix: Record<string, Record<string, number>> = {
      'small': { 'low': 1.0, 'medium': 0.6, 'high': 0.2 },
      'regular': { 'low': 0.7, 'medium': 1.0, 'high': 0.8 },
      'large': { 'low': 0.3, 'medium': 0.7, 'high': 1.0 }
    };

    return complexityMatrix[modelType]?.[complexityHint] || 0.5;
  }

  /**
   * IMPROVED: Better strategy selection with token awareness
   */
  public selectBalancedStrategy(issue: GitHubIssue): {
    model: string;
    needsSummarization: boolean;
    estimatedCost: number;
    modelConfig: ModelConfig;
    fallbackModels: string[];
    priority: 'high' | 'medium' | 'low';
    estimatedTokens: number;
  } {
    const issueContent = `${issue.title} ${issue.body || ''}`;
    const totalTokens = this.estimateTokens(issueContent);
    
    const complexityHint = this.estimateIssueComplexity(issue);
    const priority = this.determineIssuePriority(issue);

    console.log(`📊 Balanced analysis for issue #${issue.number}:`);
    console.log(`   Tokens: ${totalTokens}, Complexity: ${complexityHint}, Priority: ${priority}`);

    // Determine if summarization is needed based on context limits
    const { needsSummarization, analysisTokens } = this.determineSummarizationNeed(totalTokens);

    try {
      const balancedRequest = this.selectOptimalModel(analysisTokens, complexityHint, priority);
      const modelConfig = this.getModelConfigById(balancedRequest.modelId);

      if (!modelConfig) {
        throw new Error(`Model config not found for ${balancedRequest.modelId}`);
      }

      return {
        model: balancedRequest.modelId,
        needsSummarization,
        estimatedCost: this.estimateAnalysisCost(analysisTokens, modelConfig),
        modelConfig,
        fallbackModels: balancedRequest.fallbackModels,
        priority,
        estimatedTokens: analysisTokens
      };
    } catch (error) {
      console.warn('⚠️ Balanced selection failed, using emergency fallback strategy');
      return this.getEmergencyFallbackStrategy(issue, totalTokens, needsSummarization);
    }
  }

  /**
   * NEW: Better summarization decision making
   */
  private determineSummarizationNeed(totalTokens: number): { needsSummarization: boolean; analysisTokens: number } {
    const maxContext = Math.max(
      config.ai.smallModel.maxContext,
      config.ai.regularModel.maxContext, 
      config.ai.largeModel.maxContext
    );

    // If tokens exceed any model's context, force summarization
    if (totalTokens > maxContext * 0.7) {
      return { needsSummarization: true, analysisTokens: Math.min(config.ai.maxIssueTokens, totalTokens) };
    }

    // If tokens are very large, force summarization for cost reasons
    if (totalTokens > 15000) {
      return { needsSummarization: true, analysisTokens: 15000 };
    }

    return { needsSummarization: false, analysisTokens: totalTokens };
  }

  /**
   * IMPROVED: Emergency fallback that always works
   */
  private getEmergencyFallbackStrategy(
    issue: GitHubIssue, 
    totalTokens: number, 
    needsSummarization: boolean
  ) {
    console.log('🆘 Using emergency fallback strategy');
    
    const smallModel = config.ai.smallModel;
    const regularModel = config.ai.regularModel;
    const largeModel = config.ai.largeModel;

    // Always prefer small model for fallback - it's most likely to have capacity
    let modelConfig = smallModel;
    let fallbackModels = [regularModel.id, largeModel.id];

    // Only use larger models if small can't handle context and we have summarization
    if (needsSummarization && totalTokens > smallModel.maxContext * 0.7) {
      if (totalTokens <= regularModel.maxContext * 0.7) {
        modelConfig = regularModel;
        fallbackModels = [smallModel.id, largeModel.id];
      } else if (totalTokens <= largeModel.maxContext * 0.7) {
        modelConfig = largeModel;
        fallbackModels = [smallModel.id, regularModel.id];
      }
    }

    const analysisTokens = needsSummarization ? config.ai.maxIssueTokens : totalTokens;

    return {
      model: modelConfig.id,
      needsSummarization,
      estimatedCost: this.estimateAnalysisCost(analysisTokens, modelConfig),
      modelConfig,
      fallbackModels,
      priority: 'medium' as const,
      estimatedTokens: analysisTokens
    };
  }

  // Helper methods (keep existing)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private estimateAnalysisCost(tokens: number, modelConfig: ModelConfig): number {
    return (tokens / 1000000) * modelConfig.priceInput;
  }

  private getModelConfigById(modelId: string): ModelConfig | null {
    const models = [config.ai.smallModel, config.ai.regularModel, config.ai.largeModel];
    return models.find(model => model.id === modelId) || null;
  }

  public getSystemStatus() {
    const status: any = {};
    
    for (const [modelId, load] of this.modelLoads) {
      status[modelId] = {
        utilization: Math.round(load.utilization * 100),
        availableCapacity: load.availableCapacity,
        currentUsage: load.currentUsage,
        avgResponseTime: Math.round(load.avgResponseTime),
        errorRate: Math.round(load.errorRate * 100)
      };
    }
    
    return status;
  }

  public recordModelPerformance(
    modelId: string, 
    responseTime: number, 
    success: boolean,
    error?: string
  ): void {
    const load = this.modelLoads.get(modelId);
    if (!load) return;

    load.avgResponseTime = (load.avgResponseTime * 0.8) + (responseTime * 0.2);

    if (!success) {
      load.errorRate = (load.errorRate * 0.9) + 0.1;
      load.lastError = error;
    } else {
      load.errorRate = load.errorRate * 0.95;
      load.lastError = undefined;
    }
  }

  private calculateEstimatedResponseTime(modelConfig: ModelConfig, utilization: number): number {
    const baseTimes: Record<string, number> = {
      'small': 2000,
      'regular': 3000,
      'large': 5000
    };

    const baseTime = baseTimes[modelConfig.type] || 3000;
    
    if (utilization > 0.7) {
      return baseTime * (1 + (utilization - 0.7) * 2);
    }
    
    return baseTime;
  }

  private estimateIssueComplexity(issue: GitHubIssue): 'low' | 'medium' | 'high' {
    let score = 0;
    if (issue.title.length > 100) score += 1;
    if (issue.title.toLowerCase().includes('bug') || issue.title.includes('fix')) score += 1;
    if (issue.title.toLowerCase().includes('feature') || issue.title.includes('enhancement')) score += 1;
    if (issue.body && issue.body.length > 1000) score += 2;
    if (issue.body && (issue.body.includes('error') || issue.body.includes('exception'))) score += 1;
    if (issue.comments > 5) score += 1;
    if (issue.comments > 10) score += 1;
    
    const complexLabels = ['complex', 'difficult', 'blocker', 'critical'];
    if (issue.labels.some(label => complexLabels.includes(label.name.toLowerCase()))) {
      score += 2;
    }

    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  private determineIssuePriority(issue: GitHubIssue): 'high' | 'medium' | 'low' {
    if (issue.labels.some(label => 
      ['urgent', 'critical', 'blocker', 'p0', 'p1'].includes(label.name.toLowerCase())
    )) return 'high';

    if (issue.state === 'open' && issue.comments > 10) return 'high';
    if (issue.labels.some(label => 
      ['bug', 'fix', 'p2'].includes(label.name.toLowerCase())
    )) return 'medium';

    return 'low';
  }
}

// Singleton instance
export const tokenBalancer = new AdvancedTokenBalancer();