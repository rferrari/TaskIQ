// src/lib/rate-limiter.ts
import { ModelConfig, config } from '@/config';

interface TokenUsage {
  tokens: number;
  timestamp: number;
}

class TPMLimiter {
  private usage: Map<string, TokenUsage[]> = new Map();
  private readonly safetyBuffer = 0.1; // 10% safety buffer

  /**
   * Get model config by ID (works with any model name)
   */
  private getModelConfigById(modelId: string): ModelConfig | null {
    // Check all configured models
    const models = [config.ai.smallModel, config.ai.regularModel, config.ai.largeModel];
    return models.find(model => model.id === modelId) || null;
  }

  /**
   * Get model config by type
   */
  private getModelConfigByType(type: 'small' | 'regular' | 'large'): ModelConfig {
    return config.ai[`${type}Model`];
  }

  /**
   * Track token usage for a model and wait if approaching TPM limit
   */
  async checkAndWait(modelId: string, tokensToUse: number): Promise<void> {
    const modelConfig = this.getModelConfigById(modelId);
    
    if (!modelConfig) {
      console.warn(`⚠️ No TPM config found for model ${modelId}, using small model limits`);
      // Fall back to small model limits for unknown models
      const fallbackConfig = this.getModelConfigByType('small');
      return this.checkAndWaitWithConfig(fallbackConfig, tokensToUse);
    }

    return this.checkAndWaitWithConfig(modelConfig, tokensToUse);
  }

  /**
   * Track token usage with explicit model config
   */
  async checkAndWaitWithConfig(modelConfig: ModelConfig, tokensToUse: number): Promise<void> {
    const modelId = modelConfig.id;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Initialize or clean up old usage data for this model
    if (!this.usage.has(modelId)) {
      this.usage.set(modelId, []);
    }

    const modelUsage = this.usage.get(modelId)!;
    
    // Remove usage data older than 1 minute
    const recentUsage = modelUsage.filter(usage => usage.timestamp > oneMinuteAgo);
    this.usage.set(modelId, recentUsage);

    // Calculate current minute's usage
    const currentMinuteUsage = recentUsage.reduce((sum, usage) => sum + usage.tokens, 0);
    const projectedUsage = currentMinuteUsage + tokensToUse;
    
    const tpmLimit = modelConfig.tpm * (1 - this.safetyBuffer); // Apply safety buffer

    console.log(`📊 TPM Check for ${modelId}: ${currentMinuteUsage} + ${tokensToUse} = ${projectedUsage} / ${modelConfig.tpm}`);

    // If we're approaching the limit, wait until the minute rolls over
    if (projectedUsage > tpmLimit) {
      const oldestUsage = recentUsage[0];
      if (oldestUsage) {
        const timeToWait = Math.max(0, (oldestUsage.timestamp + 60000) - now + 1000); // +1s buffer
        console.log(`⏳ TPM limit approaching. Waiting ${Math.ceil(timeToWait / 1000)}s for reset...`);
        await new Promise(resolve => setTimeout(resolve, timeToWait));
        
        // Clear usage after waiting (new minute started)
        this.usage.set(modelId, []);
        console.log(`✅ TPM reset complete for ${modelId}`);
      }
    }

    // Record this usage
    modelUsage.push({
      tokens: tokensToUse,
      timestamp: now
    });
  }

  /**
   * Estimate tokens for a request (input + max output)
   */
  estimateRequestTokens(messages: any[], modelConfig: ModelConfig): number {
    // Estimate input tokens from messages
    const inputTokens = messages.reduce((total, message) => {
      return total + this.estimateTokens(message.content || '');
    }, 0);

    // Add max possible output tokens
    const outputTokens = modelConfig.maxCompletion;

    return inputTokens + outputTokens;
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Get current usage for debugging
   */
  getUsage(modelId: string): TokenUsage[] {
    return this.usage.get(modelId) || [];
  }

  /**
   * Reset usage for a model
   */
  reset(modelId: string): void {
    this.usage.delete(modelId);
  }
}

// Singleton instance
export const tpmLimiter = new TPMLimiter();