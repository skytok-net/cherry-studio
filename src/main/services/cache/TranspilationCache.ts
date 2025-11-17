/**
 * Transpilation Cache Implementation
 * LRU caching with SHA-256 hashing for transpilation results
 * Feature: 003-transpiler-service-rearchitecture
 */

import * as crypto from 'crypto';
import type {
  ITranspilationCache,
  CachedResult,
  CacheMetadata,
  CacheStatistics,
  CacheConfig
} from './ITranspilationCache';
import type { ArtifactFramework, ExecutionMode } from '../transpilation/ITranspilationService';
import type { TranspilationRequest, TranspilationResult } from '../transpilation/ITranspilationService';

interface CacheEntry {
  key: string;
  result: TranspilationResult;
  metadata: CacheMetadata;
  cachedAt: Date;
  size: number;
  accessCount: number;
  lastAccessed: Date;
  prev?: CacheEntry;
  next?: CacheEntry;
}

export class TranspilationCache implements ITranspilationCache {
  private cache = new Map<string, CacheEntry>();
  private head: CacheEntry | null = null;
  private tail: CacheEntry | null = null;
  private config: CacheConfig;
  private stats: CacheStatistics;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxEntries: 1000,
      maxSize: 100 * 1024 * 1024, // 100MB
      defaultTTL: 60 * 60 * 1000, // 1 hour
      evictionStrategy: 'lru',
      enablePersistence: false,
      enableCompression: false,
      hashAlgorithm: 'sha256',
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      metricsConfig: {
        enableDetailedMetrics: true,
        collectionInterval: 60 * 1000, // 1 minute
        enableExport: false
      },
      ...config
    };

    this.stats = this.initializeStats();
    this.startCleanupTimer();
  }

  /**
   * Retrieve cached transpilation result
   * Maps to FR-013: Result caching implementation
   */
  async get(key: string): Promise<CachedResult | null> {
    const startTime = Date.now();

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.recordCacheMiss();
        return null;
      }

      // Check TTL expiration
      if (this.isExpired(entry)) {
        this.removeEntry(entry);
        this.recordCacheMiss();
        return null;
      }

      // Update access tracking
      entry.accessCount++;
      entry.lastAccessed = new Date();

      // Move to front (LRU)
      this.moveToFront(entry);

      // Record cache hit
      this.recordCacheHit(Date.now() - startTime);

      return {
        result: entry.result,
        metadata: entry.metadata,
        cachedAt: entry.cachedAt,
        key: entry.key,
        size: entry.size,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed
      };
    } catch (error) {
      this.recordCacheMiss();
      return null;
    }
  }

  /**
   * Store transpilation result in cache
   * Maps to performance optimization requirements
   */
  async set(key: string, result: TranspilationResult, metadata: CacheMetadata): Promise<void> {
    try {
      // Calculate entry size
      const size = this.calculateEntrySize(result, metadata);

      // Check if we need to evict entries
      await this.ensureCapacity(size);

      // Remove existing entry if present
      if (this.cache.has(key)) {
        const existingEntry = this.cache.get(key)!;
        this.removeEntry(existingEntry);
      }

      // Create new entry
      const entry: CacheEntry = {
        key,
        result,
        metadata,
        cachedAt: new Date(),
        size,
        accessCount: 0,
        lastAccessed: new Date()
      };

      // Add to cache and LRU list
      this.cache.set(key, entry);
      this.addToFront(entry);

      // Update stats
      this.stats.totalEntries = this.cache.size;
      this.stats.currentSize += size;
      this.updateFrameworkDistribution(metadata.framework);
      this.updateExecutionModeDistribution(metadata.executionMode);
      this.stats.recentActivity.recentAdditions++;
    } catch (error) {
      // Silently fail to avoid disrupting transpilation
    }
  }

  /**
   * Generate cache key from transpilation request
   * Maps to content-based hashing strategy
   */
  async generateKey(request: TranspilationRequest): Promise<string> {
    const keyData = {
      code: request.code,
      framework: request.framework,
      language: request.language,
      filename: request.filename || '',
      options: request.options || {}
    };

    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    return this.generateHash(keyString);
  }

  /**
   * Check if cache contains entry for key
   * Maps to cache hit optimization
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Remove specific cache entry
   * Maps to cache invalidation requirements
   */
  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (entry) {
      this.removeEntry(entry);
      return true;
    }
    return false;
  }

  /**
   * Clear all cached results
   * Maps to cache management requirements
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.stats = this.initializeStats();
  }

  /**
   * Get cache statistics and performance metrics
   * Maps to monitoring and debugging requirements
   */
  getStats(): CacheStatistics {
    // Update utilization percentage
    this.stats.utilizationPercentage = (this.stats.currentSize / this.config.maxSize) * 100;

    // Update hit rate
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = totalRequests > 0 ? (this.stats.hitCount / totalRequests) * 100 : 0;

    return { ...this.stats };
  }

  /**
   * Perform cache maintenance and cleanup
   * Maps to memory management requirements
   */
  async cleanup(): Promise<void> {
    const expiredEntries: CacheEntry[] = [];

    // Find expired entries
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expiredEntries.push(entry);
      }
    }

    // Remove expired entries
    for (const entry of expiredEntries) {
      this.removeEntry(entry);
      this.stats.recentActivity.recentEvictions++;
    }

    // Update stats
    this.stats.totalEntries = this.cache.size;
  }

  /**
   * Get cache configuration and limits
   * Maps to cache sizing and policy requirements
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   * Maps to dynamic cache tuning
   */
  updateConfig(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart cleanup timer if interval changed
    if (config.cleanupInterval && this.cleanupTimer) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }

    // Enforce new size limits if needed
    if (config.maxEntries || config.maxSize) {
      this.enforceCapacityLimits();
    }
  }

  // Private helper methods

  private generateHash(content: string): string {
    return crypto.createHash(this.config.hashAlgorithm).update(content).digest('hex');
  }

  private calculateEntrySize(result: TranspilationResult, metadata: CacheMetadata): number {
    const resultSize = Buffer.byteLength(result.code, 'utf8') +
                      Buffer.byteLength(result.map || '', 'utf8');
    const metadataSize = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
    return resultSize + metadataSize + 200; // Add overhead estimate
  }

  private async ensureCapacity(newEntrySize: number): Promise<void> {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries && this.tail) {
      this.removeEntry(this.tail);
      this.stats.recentActivity.recentEvictions++;
    }

    // Check size limit
    while (this.stats.currentSize + newEntrySize > this.config.maxSize && this.tail) {
      this.removeEntry(this.tail);
      this.stats.recentActivity.recentEvictions++;
    }
  }

  private enforceCapacityLimits(): void {
    // Enforce entry count limit
    while (this.cache.size > this.config.maxEntries && this.tail) {
      this.removeEntry(this.tail);
    }

    // Enforce size limit
    while (this.stats.currentSize > this.config.maxSize && this.tail) {
      this.removeEntry(this.tail);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    if (!entry.metadata.ttl) return false;
    const now = Date.now();
    const entryTime = entry.cachedAt.getTime();
    return now - entryTime > entry.metadata.ttl;
  }

  private addToFront(entry: CacheEntry): void {
    entry.next = this.head ?? undefined;
    entry.prev = undefined;

    if (this.head) {
      this.head.prev = entry;
    }

    this.head = entry;

    if (!this.tail) {
      this.tail = entry;
    }
  }

  private moveToFront(entry: CacheEntry): void {
    if (entry === this.head) return;

    // Remove from current position
    if (entry.prev) {
      entry.prev.next = entry.next ?? undefined;
    }
    if (entry.next) {
      entry.next.prev = entry.prev ?? undefined;
    }
    if (entry === this.tail) {
      this.tail = entry.prev ?? null;
    }

    // Add to front
    this.addToFront(entry);
  }

  private removeEntry(entry: CacheEntry): void {
    // Remove from cache map
    this.cache.delete(entry.key);

    // Remove from LRU list
    if (entry.prev) {
      entry.prev.next = entry.next ?? undefined;
    } else {
      this.head = entry.next ?? null;
    }

    if (entry.next) {
      entry.next.prev = entry.prev ?? undefined;
    } else {
      this.tail = entry.prev ?? null;
    }

    // Update stats
    this.stats.currentSize -= entry.size;
    this.stats.totalEntries = this.cache.size;
  }

  private recordCacheHit(accessTime: number): void {
    this.stats.hitCount++;
    this.stats.recentActivity.recentHits++;
    this.updateAverageAccessTime(accessTime);
  }

  private recordCacheMiss(): void {
    this.stats.missCount++;
    this.stats.recentActivity.recentMisses++;
  }

  private updateAverageAccessTime(accessTime: number): void {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    if (totalRequests === 1) {
      this.stats.averageAccessTime = accessTime;
    } else {
      this.stats.averageAccessTime =
        (this.stats.averageAccessTime * (totalRequests - 1) + accessTime) / totalRequests;
    }
  }

  private updateFrameworkDistribution(framework: ArtifactFramework): void {
    this.stats.frameworkDistribution[framework] =
      (this.stats.frameworkDistribution[framework] || 0) + 1;
  }

  private updateExecutionModeDistribution(mode: ExecutionMode): void {
    this.stats.executionModeDistribution[mode] =
      (this.stats.executionModeDistribution[mode] || 0) + 1;
  }

  private initializeStats(): CacheStatistics {
    return {
      totalEntries: 0,
      currentSize: 0,
      maxSize: this.config.maxSize,
      utilizationPercentage: 0,
      hitCount: 0,
      missCount: 0,
      hitRate: 0,
      averageAccessTime: 0,
      performance: {
        totalTimeSaved: 0,
        averageTimeSaved: 0,
        fastestRetrieval: Infinity,
        slowestRetrieval: 0,
        efficiencyScore: 100
      },
      frameworkDistribution: {} as Record<ArtifactFramework, number>,
      executionModeDistribution: {} as Record<ExecutionMode, number>,
      recentActivity: {
        recentHits: 0,
        recentMisses: 0,
        recentAdditions: 0,
        recentEvictions: 0,
        activityTrend: 'stable'
      }
    };
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}