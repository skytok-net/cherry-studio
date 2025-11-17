/**
 * Fallback Chain Implementation
 * Provider orchestration with graceful degradation
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  IFallbackChain,
  FallbackChainStatus,
  ProviderChainInfo,
  FailureRecord,
  ChainHealth,
  RecoveryStrategy,
  FallbackChainConfig,
  FallbackChainMetrics,
  ProviderUsageStats
} from './IFallbackChain';
import type { ExecutionMode } from './ITranspilationService';
import type { ITranspilationProvider, ProviderError } from '../providers/ITranspilationProvider';

export class FallbackChain implements IFallbackChain {
  private providers: ProviderChainInfo[] = [];
  private currentIndex: number = 0;
  private initializedAt?: Date;
  private lastResetAt?: Date;
  private recentFailures: FailureRecord[] = [];
  private config: FallbackChainConfig;
  private metrics: FallbackChainMetrics;

  constructor(config?: Partial<FallbackChainConfig>) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      resetOnSuccess: true,
      maxFailureAge: 60 * 60 * 1000, // 1 hour
      minSuccessRate: 0.8,
      healthCheckInterval: 30 * 1000, // 30 seconds
      timeouts: {
        initialization: 10000,
        transpilation: 30000,
        availabilityCheck: 5000,
        healthCheck: 3000
      },
      ...config
    };

    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the fallback chain with available providers
   * Maps to FR-008: Graceful fallback implementation
   */
  async initialize(providers: ITranspilationProvider[]): Promise<void> {
    if (providers.length === 0) {
      throw new Error('Cannot initialize fallback chain with empty provider list');
    }

    this.initializedAt = new Date();
    this.providers = [];
    this.currentIndex = 0;

    // Sort providers by priority (lower number = higher priority)
    const sortedProviders = [...providers].sort((a, b) => {
      const infoA = a.getProviderInfo();
      const infoB = b.getProviderInfo();
      return infoA.priority - infoB.priority;
    });

    // Initialize provider chain info
    for (const provider of sortedProviders) {
      const info = provider.getProviderInfo();
      const chainInfo: ProviderChainInfo = {
        provider,
        info,
        status: 'uninitialized',
        failureCount: 0,
        isAvailable: false,
        isInitialized: false
      };

      try {
        // Check if provider is available
        chainInfo.status = 'initializing';
        const isAvailable = await this.withTimeout(
          provider.isAvailable(),
          this.config.timeouts.availabilityCheck
        );

        if (isAvailable) {
          await this.withTimeout(
            provider.initialize(),
            this.config.timeouts.initialization
          );
          chainInfo.status = 'ready';
          chainInfo.isAvailable = true;
          chainInfo.isInitialized = true;
        } else {
          chainInfo.status = 'unavailable';
        }
      } catch (error) {
        chainInfo.status = 'failed';
        chainInfo.lastFailure = this.createFailureRecord(provider, error as Error);
        chainInfo.failureCount = 1;
      }

      this.providers.push(chainInfo);
      this.initializeProviderMetrics(info.executionMode);
    }

    // Ensure we have at least one available provider
    if (!this.hasAvailableProviders()) {
      throw new Error('No providers are available in the fallback chain');
    }
  }

  /**
   * Get the next available provider in the fallback chain
   * Maps to graceful degradation requirements
   */
  getNextProvider(): ITranspilationProvider | null {
    // Start from current index and look for next available provider
    for (let i = this.currentIndex; i < this.providers.length; i++) {
      const chainInfo = this.providers[i];
      if (this.isProviderUsable(chainInfo)) {
        this.currentIndex = i;
        return chainInfo.provider;
      }
    }

    // No providers available
    return null;
  }

  /**
   * Record a provider failure and move to next in chain
   * Maps to FR-010: Error reporting and debugging
   */
  recordFailure(provider: ITranspilationProvider, error: ProviderError): void {
    const providerInfo = provider.getProviderInfo();
    const chainInfo = this.findProviderChainInfo(provider);

    if (chainInfo) {
      // Update provider status
      chainInfo.status = 'failed';
      chainInfo.failureCount++;

      // Create failure record
      const failureRecord = this.createFailureRecord(provider, error);
      chainInfo.lastFailure = failureRecord;

      // Add to recent failures (with cleanup)
      this.recentFailures.unshift(failureRecord);
      this.cleanupOldFailures();

      // Update metrics
      this.metrics.failedTranspilations++;
      this.updateProviderUsageStats(providerInfo.executionMode, false);

      // Move to next provider
      this.moveToNextProvider();
    }
  }

  /**
   * Reset chain to primary provider
   * Maps to recovery and optimization requirements
   */
  reset(): void {
    this.currentIndex = 0;
    this.lastResetAt = new Date();

    // Reset provider statuses (except permanently failed ones)
    for (const chainInfo of this.providers) {
      if (chainInfo.status === 'failed' && this.shouldRetryProvider(chainInfo)) {
        chainInfo.status = 'ready';
      }
    }
  }

  /**
   * Get current chain status and provider information
   * Maps to monitoring and debugging requirements
   */
  getChainStatus(): FallbackChainStatus {
    const currentProvider = this.providers[this.currentIndex];
    const failedProviders = this.providers.filter(p => p.status === 'failed').length;

    return {
      providers: [...this.providers],
      currentIndex: this.currentIndex,
      currentProvider: currentProvider ? { ...currentProvider } : undefined,
      failedProviders,
      totalProviders: this.providers.length,
      health: this.calculateChainHealth(),
      recentFailures: [...this.recentFailures],
      initializedAt: this.initializedAt,
      lastResetAt: this.lastResetAt
    };
  }

  /**
   * Check if any providers are available
   * Maps to service availability requirements
   */
  hasAvailableProviders(): boolean {
    return this.providers.some(chainInfo => this.isProviderUsable(chainInfo));
  }

  /**
   * Get provider by execution mode
   * Maps to explicit provider selection
   */
  getProviderByMode(mode: ExecutionMode): ITranspilationProvider | null {
    const chainInfo = this.providers.find(p => p.info.executionMode === mode);
    return chainInfo && this.isProviderUsable(chainInfo) ? chainInfo.provider : null;
  }

  // Public methods for metrics and monitoring

  public getMetrics(): FallbackChainMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  public recordSuccessfulTranspilation(provider: ITranspilationProvider, duration: number): void {
    const providerInfo = provider.getProviderInfo();
    const chainInfo = this.findProviderChainInfo(provider);

    if (chainInfo) {
      chainInfo.lastSuccess = new Date();
      if (chainInfo.status === 'failed') {
        chainInfo.status = 'ready';
      }
    }

    // Update metrics
    this.metrics.successfulTranspilations++;
    this.updateProviderUsageStats(providerInfo.executionMode, true);
    this.updatePerformanceMetrics(duration);

    // Reset chain if configured to do so
    if (this.config.resetOnSuccess && this.currentIndex > 0) {
      this.reset();
    }
  }

  // Private helper methods

  private findProviderChainInfo(provider: ITranspilationProvider): ProviderChainInfo | undefined {
    return this.providers.find(chainInfo => chainInfo.provider === provider);
  }

  private isProviderUsable(chainInfo: ProviderChainInfo): boolean {
    return chainInfo.isAvailable &&
           chainInfo.isInitialized &&
           ['ready', 'busy'].includes(chainInfo.status);
  }

  private shouldRetryProvider(chainInfo: ProviderChainInfo): boolean {
    if (!chainInfo.lastFailure) return true;

    const timeSinceFailure = Date.now() - chainInfo.lastFailure.timestamp.getTime();
    const retryDelay = this.config.retryDelay * Math.pow(2, Math.min(chainInfo.failureCount - 1, 5));

    return timeSinceFailure >= retryDelay;
  }

  private moveToNextProvider(): void {
    this.currentIndex++;
  }

  private createFailureRecord(provider: ITranspilationProvider, error: Error): FailureRecord {
    const providerInfo = provider.getProviderInfo();

    return {
      timestamp: new Date(),
      providerName: providerInfo.name,
      executionMode: providerInfo.executionMode,
      error: error as ProviderError,
      recoveryStrategy: this.determineRecoveryStrategy(error as ProviderError)
    };
  }

  private determineRecoveryStrategy(error: ProviderError): RecoveryStrategy {
    if (error.recoverable) {
      return {
        type: 'retry',
        action: 'Retry with exponential backoff',
        delay: this.config.retryDelay,
        maxAttempts: this.config.maxRetries,
        confidence: 'medium'
      };
    } else {
      return {
        type: 'fallback',
        action: 'Switch to next available provider',
        delay: 0,
        maxAttempts: 1,
        confidence: 'high'
      };
    }
  }

  private cleanupOldFailures(): void {
    const maxAge = this.config.maxFailureAge;
    const cutoffTime = Date.now() - maxAge;

    this.recentFailures = this.recentFailures.filter(
      failure => failure.timestamp.getTime() >= cutoffTime
    );
  }

  private calculateChainHealth(): ChainHealth {
    const totalProviders = this.providers.length;
    const healthyProviders = this.providers.filter(p => this.isProviderUsable(p)).length;
    const healthyPercentage = (healthyProviders / totalProviders) * 100;

    const primaryProvider = this.providers[0];
    const primaryHealthy = primaryProvider ? this.isProviderUsable(primaryProvider) : false;

    const consecutiveFailures = this.recentFailures.length;
    const recentSuccessRate = this.calculateRecentSuccessRate();

    let status: ChainHealth['status'] = 'healthy';
    let healthScore = 100;

    if (healthyPercentage === 0) {
      status = 'failed';
      healthScore = 0;
    } else if (healthyPercentage < 50 || !primaryHealthy) {
      status = 'critical';
      healthScore = healthyPercentage * 0.5;
    } else if (healthyPercentage < 80 || consecutiveFailures > 3) {
      status = 'degraded';
      healthScore = healthyPercentage * 0.8;
    }

    return {
      status,
      healthyProviderPercentage: healthyPercentage,
      primaryProviderHealthy: primaryHealthy,
      consecutiveFailures,
      recentSuccessRate,
      healthScore: Math.max(0, Math.min(100, healthScore))
    };
  }

  private calculateRecentSuccessRate(): number {
    const recentAttempts = this.metrics.successfulTranspilations + this.metrics.failedTranspilations;
    return recentAttempts > 0 ? (this.metrics.successfulTranspilations / recentAttempts) : 1.0;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private initializeMetrics(): FallbackChainMetrics {
    return {
      totalAttempts: 0,
      successfulTranspilations: 0,
      failedTranspilations: 0,
      successRate: 1.0,
      providerUsage: {} as Record<ExecutionMode, ProviderUsageStats>,
      averageFallbackDepth: 0,
      performance: {
        averageTranspilationTime: 0,
        averageFallbackTime: 0,
        fastestTime: Infinity,
        slowestTime: 0,
        initializationTime: 0
      }
    };
  }

  private initializeProviderMetrics(mode: ExecutionMode): void {
    if (!this.metrics.providerUsage[mode]) {
      this.metrics.providerUsage[mode] = {
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        averageTime: 0,
        successRate: 1.0
      };
    }
  }

  private updateProviderUsageStats(mode: ExecutionMode, success: boolean): void {
    const stats = this.metrics.providerUsage[mode];
    if (stats) {
      stats.usageCount++;
      if (success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
      }
      stats.successRate = stats.successCount / stats.usageCount;
    }
  }

  private updatePerformanceMetrics(duration: number): void {
    const perf = this.metrics.performance;
    const totalTranspilations = this.metrics.successfulTranspilations;

    if (totalTranspilations === 1) {
      perf.averageTranspilationTime = duration;
    } else {
      perf.averageTranspilationTime =
        (perf.averageTranspilationTime * (totalTranspilations - 1) + duration) / totalTranspilations;
    }

    perf.fastestTime = Math.min(perf.fastestTime, duration);
    perf.slowestTime = Math.max(perf.slowestTime, duration);
  }

  private updateMetrics(): void {
    this.metrics.totalAttempts = this.metrics.successfulTranspilations + this.metrics.failedTranspilations;
    this.metrics.successRate = this.metrics.totalAttempts > 0 ?
      this.metrics.successfulTranspilations / this.metrics.totalAttempts : 1.0;

    // Calculate average fallback depth
    const totalFallbacks = this.recentFailures.length;
    this.metrics.averageFallbackDepth = totalFallbacks > 0 ? totalFallbacks / this.metrics.totalAttempts : 0;
  }
}