/**
 * Transpilation Cache Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

// Re-export types from other interfaces
import type { TranspilationRequest, TranspilationResult, ArtifactFramework, ExecutionMode } from '../transpilation/ITranspilationService';

export interface ITranspilationCache {
  /**
   * Retrieve cached transpilation result
   * Maps to FR-013: Result caching implementation
   */
  get(key: string): Promise<CachedResult | null>;

  /**
   * Store transpilation result in cache
   * Maps to performance optimization requirements
   */
  set(key: string, result: TranspilationResult, metadata: CacheMetadata): Promise<void>;

  /**
   * Generate cache key from transpilation request
   * Maps to content-based hashing strategy
   */
  generateKey(request: TranspilationRequest): Promise<string>;

  /**
   * Check if cache contains entry for key
   * Maps to cache hit optimization
   */
  has(key: string): Promise<boolean>;

  /**
   * Remove specific cache entry
   * Maps to cache invalidation requirements
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all cached results
   * Maps to cache management requirements
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics and performance metrics
   * Maps to monitoring and debugging requirements
   */
  getStats(): CacheStatistics;

  /**
   * Perform cache maintenance and cleanup
   * Maps to memory management requirements
   */
  cleanup(): Promise<void>;

  /**
   * Get cache configuration and limits
   * Maps to cache sizing and policy requirements
   */
  getConfig(): CacheConfig;

  /**
   * Update cache configuration
   * Maps to dynamic cache tuning
   */
  updateConfig(config: Partial<CacheConfig>): void;
}

export interface CachedResult {
  /** Cached transpilation result */
  result: TranspilationResult;

  /** Cache metadata */
  metadata: CacheMetadata;

  /** When this entry was cached */
  cachedAt: Date;

  /** Cache key used for this entry */
  key: string;

  /** Size of cached data in bytes */
  size: number;

  /** Number of times this entry was accessed */
  accessCount: number;

  /** Last access timestamp */
  lastAccessed: Date;
}

export interface CacheMetadata {
  /** Original transpilation request */
  originalRequest: TranspilationRequest;

  /** Framework used for transpilation */
  framework: ArtifactFramework;

  /** Execution mode that produced this result */
  executionMode: ExecutionMode;

  /** Original transpilation duration */
  originalDuration: number;

  /** Source code hash for validation */
  sourceHash: string;

  /** Options hash for validation */
  optionsHash: string;

  /** Cache entry version */
  version: number;

  /** TTL (time to live) in milliseconds */
  ttl?: number;

  /** Custom tags for cache organization */
  tags?: string[];
}

export interface CacheStatistics {
  /** Total number of cache entries */
  totalEntries: number;

  /** Current cache size in bytes */
  currentSize: number;

  /** Maximum cache size in bytes */
  maxSize: number;

  /** Cache size utilization percentage */
  utilizationPercentage: number;

  /** Cache hit count */
  hitCount: number;

  /** Cache miss count */
  missCount: number;

  /** Cache hit rate percentage */
  hitRate: number;

  /** Average cache access time */
  averageAccessTime: number;

  /** Cache performance metrics */
  performance: CachePerformanceMetrics;

  /** Entry distribution by framework */
  frameworkDistribution: Record<ArtifactFramework, number>;

  /** Entry distribution by execution mode */
  executionModeDistribution: Record<ExecutionMode, number>;

  /** Recent activity metrics */
  recentActivity: CacheActivityMetrics;
}

export interface CachePerformanceMetrics {
  /** Total time saved by cache hits */
  totalTimeSaved: number;

  /** Average time saved per cache hit */
  averageTimeSaved: number;

  /** Fastest cache retrieval time */
  fastestRetrieval: number;

  /** Slowest cache retrieval time */
  slowestRetrieval: number;

  /** Cache efficiency score (0-100) */
  efficiencyScore: number;
}

export interface CacheActivityMetrics {
  /** Hits in the last hour */
  recentHits: number;

  /** Misses in the last hour */
  recentMisses: number;

  /** New entries added in the last hour */
  recentAdditions: number;

  /** Entries evicted in the last hour */
  recentEvictions: number;

  /** Recent cache activity trend */
  activityTrend: 'increasing' | 'stable' | 'decreasing';
}

export interface CacheConfig {
  /** Maximum number of cache entries */
  maxEntries: number;

  /** Maximum cache size in bytes */
  maxSize: number;

  /** Default TTL for cache entries */
  defaultTTL: number;

  /** Cache eviction strategy */
  evictionStrategy: CacheEvictionStrategy;

  /** Whether to enable cache persistence */
  enablePersistence: boolean;

  /** Cache persistence location */
  persistenceLocation?: string;

  /** Whether to enable cache compression */
  enableCompression: boolean;

  /** Cache key hashing algorithm */
  hashAlgorithm: 'sha256' | 'sha1' | 'md5';

  /** Cleanup interval in milliseconds */
  cleanupInterval: number;

  /** Cache warming configuration */
  warmingConfig?: CacheWarmingConfig;

  /** Cache metrics collection settings */
  metricsConfig: CacheMetricsConfig;
}

export interface CacheWarmingConfig {
  /** Whether to enable cache warming */
  enabled: boolean;

  /** Popular frameworks to warm */
  frameworks: ArtifactFramework[];

  /** Common code patterns to pre-cache */
  commonPatterns: CacheWarmingPattern[];

  /** Maximum warming entries */
  maxWarmingEntries: number;
}

export interface CacheWarmingPattern {
  /** Pattern name */
  name: string;

  /** Framework this pattern applies to */
  framework: ArtifactFramework;

  /** Code template */
  codeTemplate: string;

  /** Pattern priority */
  priority: number;
}

export interface CacheMetricsConfig {
  /** Whether to collect detailed metrics */
  enableDetailedMetrics: boolean;

  /** Metrics collection interval */
  collectionInterval: number;

  /** Whether to export metrics */
  enableExport: boolean;

  /** Metrics export format */
  exportFormat?: 'json' | 'csv' | 'prometheus';
}

export type CacheEvictionStrategy =
  | 'lru'     // Least Recently Used
  | 'lfu'     // Least Frequently Used
  | 'fifo'    // First In, First Out
  | 'random'  // Random eviction
  | 'ttl';    // Time To Live based

// Cache events and notifications

export interface ICacheEvents {
  /** Emitted when cache entry is hit */
  onCacheHit: (key: string, result: CachedResult) => void;

  /** Emitted when cache entry is missed */
  onCacheMiss: (key: string, request: TranspilationRequest) => void;

  /** Emitted when new entry is added to cache */
  onCacheSet: (key: string, result: TranspilationResult) => void;

  /** Emitted when cache entry is evicted */
  onCacheEviction: (key: string, reason: EvictionReason) => void;

  /** Emitted when cache is cleared */
  onCacheClear: (reason: string) => void;

  /** Emitted when cache size limit is reached */
  onCacheFull: (stats: CacheStatistics) => void;
}

export type EvictionReason =
  | 'size-limit'
  | 'entry-limit'
  | 'ttl-expired'
  | 'manual'
  | 'error'
  | 'cleanup';

// Cache key generation strategies

export interface ICacheKeyGenerator {
  /**
   * Generate cache key from request
   */
  generateKey(request: TranspilationRequest): Promise<string>;

  /**
   * Generate hash from string content
   */
  generateHash(content: string, algorithm?: string): Promise<string>;

  /**
   * Validate cache key format
   */
  validateKey(key: string): boolean;
}

// Cache storage abstraction

export interface ICacheStorage {
  /**
   * Get value by key
   */
  get(key: string): Promise<any>;

  /**
   * Set value by key
   */
  set(key: string, value: any, ttl?: number): Promise<void>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete value by key
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all values
   */
  clear(): Promise<void>;

  /**
   * Get all keys
   */
  keys(): Promise<string[]>;

  /**
   * Get storage size
   */
  size(): Promise<number>;
}