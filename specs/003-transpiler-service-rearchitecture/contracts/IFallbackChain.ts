/**
 * Fallback Chain Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

export interface IFallbackChain {
  /**
   * Initialize the fallback chain with available providers
   * Maps to FR-008: Graceful fallback implementation
   */
  initialize(providers: ITranspilationProvider[]): Promise<void>;

  /**
   * Get the next available provider in the fallback chain
   * Maps to graceful degradation requirements
   */
  getNextProvider(): ITranspilationProvider | null;

  /**
   * Record a provider failure and move to next in chain
   * Maps to FR-010: Error reporting and debugging
   */
  recordFailure(provider: ITranspilationProvider, error: ProviderError): void;

  /**
   * Reset chain to primary provider
   * Maps to recovery and optimization requirements
   */
  reset(): void;

  /**
   * Get current chain status and provider information
   * Maps to monitoring and debugging requirements
   */
  getChainStatus(): FallbackChainStatus;

  /**
   * Check if any providers are available
   * Maps to service availability requirements
   */
  hasAvailableProviders(): boolean;

  /**
   * Get provider by execution mode
   * Maps to explicit provider selection
   */
  getProviderByMode(mode: ExecutionMode): ITranspilationProvider | null;
}

export interface FallbackChainStatus {
  /** All providers in the chain */
  providers: ProviderChainInfo[];

  /** Currently active provider index */
  currentIndex: number;

  /** Active provider information */
  currentProvider?: ProviderChainInfo;

  /** Number of providers that have failed */
  failedProviders: number;

  /** Total number of providers */
  totalProviders: number;

  /** Chain health status */
  health: ChainHealth;

  /** Recent failure history */
  recentFailures: FailureRecord[];

  /** Chain initialization timestamp */
  initializedAt?: Date;

  /** Last reset timestamp */
  lastResetAt?: Date;
}

export interface ProviderChainInfo {
  /** Provider instance */
  provider: ITranspilationProvider;

  /** Provider metadata */
  info: ProviderInfo;

  /** Current provider status */
  status: ProviderStatus;

  /** Number of failures for this provider */
  failureCount: number;

  /** Last failure information */
  lastFailure?: FailureRecord;

  /** Last successful use timestamp */
  lastSuccess?: Date;

  /** Provider availability status */
  isAvailable: boolean;

  /** Provider initialization status */
  isInitialized: boolean;
}

export interface FailureRecord {
  /** When the failure occurred */
  timestamp: Date;

  /** Provider that failed */
  providerName: string;

  /** Execution mode that failed */
  executionMode: ExecutionMode;

  /** Error that caused the failure */
  error: ProviderError;

  /** Request that triggered the failure */
  request?: TranspilationRequest;

  /** Failure recovery strategy */
  recoveryStrategy?: RecoveryStrategy;
}

export interface ChainHealth {
  /** Overall chain health status */
  status: 'healthy' | 'degraded' | 'critical' | 'failed';

  /** Percentage of providers that are healthy */
  healthyProviderPercentage: number;

  /** Whether primary provider is available */
  primaryProviderHealthy: boolean;

  /** Number of consecutive failures */
  consecutiveFailures: number;

  /** Recent success rate across all providers */
  recentSuccessRate: number;

  /** Health score (0-100) */
  healthScore: number;
}

export interface RecoveryStrategy {
  /** Strategy type */
  type: 'retry' | 'fallback' | 'reset' | 'escalate';

  /** Recommended action */
  action: string;

  /** Delay before attempting recovery */
  delay: number;

  /** Maximum attempts for this strategy */
  maxAttempts: number;

  /** Recovery confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export type ProviderStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'busy'
  | 'failed'
  | 'unavailable'
  | 'disposed';

// Chain configuration and policies

export interface FallbackChainConfig {
  /** Maximum number of retry attempts per provider */
  maxRetries: number;

  /** Delay between retry attempts */
  retryDelay: number;

  /** Whether to reset chain after successful transpilation */
  resetOnSuccess: boolean;

  /** Maximum age of failure records to keep */
  maxFailureAge: number;

  /** Minimum success rate to consider provider healthy */
  minSuccessRate: number;

  /** Health check interval in milliseconds */
  healthCheckInterval: number;

  /** Provider timeout settings */
  timeouts: ChainTimeouts;
}

export interface ChainTimeouts {
  /** Timeout for provider initialization */
  initialization: number;

  /** Timeout for transpilation operations */
  transpilation: number;

  /** Timeout for availability checks */
  availabilityCheck: number;

  /** Timeout for health checks */
  healthCheck: number;
}

// Events and notifications

export interface IFallbackChainEvents {
  /** Emitted when a provider fails */
  onProviderFailure: (failure: FailureRecord) => void;

  /** Emitted when falling back to next provider */
  onFallback: (from: ExecutionMode, to: ExecutionMode) => void;

  /** Emitted when chain is reset */
  onChainReset: (reason: string) => void;

  /** Emitted when all providers fail */
  onChainExhausted: (failures: FailureRecord[]) => void;

  /** Emitted when provider recovers */
  onProviderRecovery: (provider: string, mode: ExecutionMode) => void;

  /** Emitted when chain health changes */
  onHealthChange: (oldHealth: ChainHealth, newHealth: ChainHealth) => void;
}

// Chain metrics and monitoring

export interface FallbackChainMetrics {
  /** Total number of transpilations attempted */
  totalAttempts: number;

  /** Number of successful transpilations */
  successfulTranspilations: number;

  /** Number of failed transpilations */
  failedTranspilations: number;

  /** Current success rate */
  successRate: number;

  /** Provider usage statistics */
  providerUsage: Record<ExecutionMode, ProviderUsageStats>;

  /** Average fallback depth */
  averageFallbackDepth: number;

  /** Chain performance metrics */
  performance: ChainPerformanceMetrics;
}

export interface ProviderUsageStats {
  /** Number of times this provider was used */
  usageCount: number;

  /** Number of successful uses */
  successCount: number;

  /** Number of failures */
  failureCount: number;

  /** Average transpilation time */
  averageTime: number;

  /** Provider success rate */
  successRate: number;
}

export interface ChainPerformanceMetrics {
  /** Average time to complete transpilation */
  averageTranspilationTime: number;

  /** Average time to detect and fallback */
  averageFallbackTime: number;

  /** Fastest transpilation time recorded */
  fastestTime: number;

  /** Slowest transpilation time recorded */
  slowestTime: number;

  /** Time spent in initialization */
  initializationTime: number;
}

// Re-export types from other interfaces
export type {
  ExecutionMode,
  TranspilationRequest,
  ProviderError,
  ProviderInfo
} from './ITranspilationProvider';

export type { ITranspilationProvider } from './ITranspilationProvider';