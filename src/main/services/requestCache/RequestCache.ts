/**
 * Request Cache Service
 *
 * Provides intelligent caching for network requests with TTL, size limits,
 * and cache invalidation policies. Supports both memory and persistent
 * storage options for optimal performance and data persistence.
 */

import type { NetworkRequest, NetworkResponse, NetworkSettings } from '../../types/networkTypes'

// ============================================================================
// Cache Interfaces
// ============================================================================

export interface CacheEntry<T = any> {
  key: string
  value: T
  metadata: CacheEntryMetadata
  createdAt: number
  lastAccessed: number
  accessCount: number
  expiresAt: number
  tags?: Set<string>
}

export interface CacheEntryMetadata {
  originalRequest: NetworkRequest
  contentType?: string
  contentLength?: number
  etag?: string
  lastModified?: string
  cacheControl?: string
  vary?: string
  compression?: {
    algorithm: string
    originalSize: number
    compressedSize: number
  }
  validation?: {
    checksum: string
    algorithm: 'sha256' | 'md5'
  }
}

export interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  maxAge?: number // Maximum age from original response
  tags?: string[] // Cache tags for invalidation
  compress?: boolean // Enable compression for large responses
  validateChecksum?: boolean // Validate data integrity
  priority?: 'low' | 'normal' | 'high' // Cache priority for eviction
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitCount: number
  missCount: number
  evictionCount: number
  compressionRatio: number
  averageResponseTime: number
  oldestEntry?: number
  newestEntry?: number
}

export interface CacheQuery {
  keys?: string[]
  tags?: string[]
  domain?: string
  pattern?: RegExp
  maxAge?: number
  includeExpired?: boolean
}

// ============================================================================
// Cache Storage Interface
// ============================================================================

export interface CacheStorage {
  get<T>(key: string): Promise<CacheEntry<T> | null>
  set<T>(key: string, entry: CacheEntry<T>): Promise<boolean>
  delete(key: string): Promise<boolean>
  clear(): Promise<number>
  keys(): Promise<string[]>
  size(): Promise<number>
  has(key: string): Promise<boolean>
}

// ============================================================================
// Main Request Cache Class
// ============================================================================

export class RequestCache {
  private storage: CacheStorage
  private config: CacheConfig
  private stats: CacheStats
  private cleanupInterval?: NodeJS.Timeout

  constructor(storage: CacheStorage, config: CacheConfig) {
    this.storage = storage
    this.config = config
    this.stats = this.initializeStats()

    if (config.enableAutoCleanup) {
      this.startCleanupInterval()
    }
  }

  /**
   * Get cached response for a request
   */
  async get(request: NetworkRequest): Promise<NetworkResponse | null> {
    const key = this.generateCacheKey(request)
    const entry = await this.storage.get<NetworkResponse>(key)

    if (!entry) {
      this.stats.missCount++
      return null
    }

    // Check if expired
    if (this.isExpired(entry)) {
      await this.storage.delete(key)
      this.stats.missCount++
      this.stats.evictionCount++
      return null
    }

    // Update access statistics
    entry.lastAccessed = Date.now()
    entry.accessCount++
    await this.storage.set(key, entry)

    this.stats.hitCount++

    // Validate integrity if enabled
    if (this.config.validateIntegrity && entry.metadata.validation) {
      const isValid = await this.validateEntry(entry)
      if (!isValid) {
        await this.storage.delete(key)
        this.stats.missCount++
        return null
      }
    }

    return entry.value
  }

  /**
   * Store response in cache
   */
  async set(request: NetworkRequest, response: NetworkResponse, options: CacheOptions = {}): Promise<boolean> {
    try {
      // Check if response is cacheable
      if (!this.isCacheable(request, response)) {
        return false
      }

      const key = this.generateCacheKey(request)
      const ttl = options.ttl || this.config.defaultTtl
      const now = Date.now()

      // Prepare metadata
      const metadata: CacheEntryMetadata = {
        originalRequest: request,
        contentType: response.headers['content-type'],
        contentLength: parseInt(response.headers['content-length']) || response.body.length
      }

      // Add validation checksum if enabled
      if (options.validateChecksum || this.config.validateIntegrity) {
        metadata.validation = {
          checksum: await this.calculateChecksum(response.body),
          algorithm: 'sha256'
        }
      }

      // Compress if enabled and beneficial
      let finalResponse = response
      if (options.compress && this.shouldCompress(response)) {
        const compressed = await this.compressResponse(response)
        if (compressed) {
          finalResponse = compressed.response
          metadata.compression = compressed.metadata
        }
      }

      // Create cache entry
      const entry: CacheEntry<NetworkResponse> = {
        key,
        value: finalResponse,
        metadata,
        createdAt: now,
        lastAccessed: now,
        accessCount: 0,
        expiresAt: now + ttl,
        tags: options.tags ? new Set(options.tags) : undefined
      }

      // Check size limits before storing
      if (await this.exceedsSizeLimit(entry)) {
        await this.evictEntries()
      }

      const success = await this.storage.set(key, entry)
      if (success) {
        this.updateStats(entry)
      }

      return success
    } catch (error) {
      console.error('Failed to cache response:', error)
      return false
    }
  }

  /**
   * Delete cached entry
   */
  async delete(request: NetworkRequest): Promise<boolean> {
    const key = this.generateCacheKey(request)
    const success = await this.storage.delete(key)
    if (success) {
      this.stats.evictionCount++
    }
    return success
  }

  /**
   * Clear cache entries by query
   */
  async clear(query?: CacheQuery): Promise<number> {
    if (!query) {
      const count = await this.storage.clear()
      this.stats = this.initializeStats()
      return count
    }

    const keys = await this.findKeys(query)
    let deletedCount = 0

    for (const key of keys) {
      const success = await this.storage.delete(key)
      if (success) deletedCount++
    }

    this.stats.evictionCount += deletedCount
    return deletedCount
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    return this.clear({ tags })
  }

  /**
   * Invalidate cache entries by domain
   */
  async invalidateByDomain(domain: string): Promise<number> {
    return this.clear({ domain })
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalEntries = await this.storage.size()
    const totalSize = await this.calculateTotalSize()

    return {
      ...this.stats,
      totalEntries,
      totalSize,
      compressionRatio: this.calculateCompressionRatio(),
      averageResponseTime: this.calculateAverageResponseTime()
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    const keys = await this.storage.keys()
    let cleanedCount = 0

    for (const key of keys) {
      const entry = await this.storage.get(key)
      if (entry && this.isExpired(entry)) {
        await this.storage.delete(key)
        cleanedCount++
      }
    }

    this.stats.evictionCount += cleanedCount
    return cleanedCount
  }

  /**
   * Optimize cache by compacting and reorganizing
   */
  async optimize(): Promise<void> {
    // Remove expired entries
    await this.cleanup()

    // Compress uncompressed large entries
    if (this.config.enableCompression) {
      await this.compressLargeEntries()
    }

    // Update access patterns for better eviction
    await this.updateAccessPatterns()
  }

  /**
   * Dispose of cache and cleanup resources
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateCacheKey(request: NetworkRequest): string {
    // Create deterministic cache key from request parameters
    const keyData = {
      url: request.url,
      method: request.method,
      headers: this.normalizeHeaders(request.headers),
      body: request.body
    }

    return this.hashObject(keyData)
  }

  private normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {}

    // Only include headers that affect response content
    const relevantHeaders = [
      'accept',
      'accept-encoding',
      'accept-language',
      'authorization',
      'cache-control',
      'content-type'
    ]

    const normalized: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase()
      if (relevantHeaders.includes(lowerKey)) {
        normalized[lowerKey] = value.toLowerCase()
      }
    }

    return normalized
  }

  private hashObject(obj: any): string {
    // Simple hash function for cache keys
    const str = JSON.stringify(obj, Object.keys(obj).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `cache_${Math.abs(hash).toString(36)}`
  }

  private isCacheable(request: NetworkRequest, response: NetworkResponse): boolean {
    // Only cache GET requests
    if (request.method !== 'GET') return false

    // Don't cache error responses (unless configured to)
    if (response.status >= 400 && !this.config.cacheErrors) return false

    // Check cache-control headers
    const cacheControl = response.headers['cache-control']
    if (cacheControl) {
      if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) {
        return false
      }
    }

    // Check response size limits
    const contentLength = parseInt(response.headers['content-length']) || response.body.length
    if (contentLength > this.config.maxEntrySize) return false

    return true
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt
  }

  private shouldCompress(response: NetworkResponse): boolean {
    const contentType = response.headers['content-type'] || ''
    const size = response.body.length

    // Only compress text-based content above threshold
    if (size < this.config.compressionThreshold) return false

    const compressibleTypes = ['text/', 'application/json', 'application/javascript', 'application/xml']

    return compressibleTypes.some((type) => contentType.includes(type))
  }

  private async compressResponse(response: NetworkResponse): Promise<{
    response: NetworkResponse
    metadata: { algorithm: string; originalSize: number; compressedSize: number }
  } | null> {
    // Placeholder for compression implementation
    // In a real implementation, you'd use zlib or similar
    const originalSize = response.body.length
    const compressed = response.body // Would actually compress here

    return {
      response: { ...response, body: compressed },
      metadata: {
        algorithm: 'gzip',
        originalSize,
        compressedSize: compressed.length
      }
    }
  }

  private async calculateChecksum(data: string): Promise<string> {
    // Placeholder for checksum calculation
    // In a real implementation, you'd use crypto.createHash
    return `sha256_${data.length}_${Date.now()}`
  }

  private async validateEntry(entry: CacheEntry<NetworkResponse>): Promise<boolean> {
    if (!entry.metadata.validation) return true

    const currentChecksum = await this.calculateChecksum(entry.value.body)
    return currentChecksum === entry.metadata.validation.checksum
  }

  private async exceedsSizeLimit(entry: CacheEntry): Promise<boolean> {
    const currentSize = await this.calculateTotalSize()
    const entrySize = this.estimateEntrySize(entry)
    return currentSize + entrySize > this.config.maxTotalSize
  }

  private async evictEntries(): Promise<void> {
    const keys = await this.storage.keys()
    const entries: Array<{ key: string; entry: CacheEntry; score: number }> = []

    // Calculate eviction scores for all entries
    for (const key of keys) {
      const entry = await this.storage.get(key)
      if (entry) {
        const score = this.calculateEvictionScore(entry)
        entries.push({ key, entry, score })
      }
    }

    // Sort by eviction score (higher = more likely to evict)
    entries.sort((a, b) => b.score - a.score)

    // Evict entries until under size limit
    const targetSize = this.config.maxTotalSize * 0.8 // Evict to 80% capacity
    let currentSize = await this.calculateTotalSize()

    for (const { key } of entries) {
      if (currentSize <= targetSize) break

      const success = await this.storage.delete(key)
      if (success) {
        this.stats.evictionCount++
        currentSize -= this.estimateEntrySize(entries.find((e) => e.key === key)!.entry)
      }
    }
  }

  private calculateEvictionScore(entry: CacheEntry): number {
    const now = Date.now()
    const age = now - entry.createdAt
    const timeSinceAccess = now - entry.lastAccessed
    const accessFrequency = entry.accessCount / Math.max(age / (1000 * 60 * 60), 1) // accesses per hour

    // Higher score = more likely to evict
    // Factors: old entries, infrequently accessed, large size
    const ageScore = age / (1000 * 60 * 60) // Hours old
    const accessScore = 1 / (accessFrequency + 1) // Lower frequency = higher score
    const sizeScore = this.estimateEntrySize(entry) / 1024 // KB
    const stalenessScore = timeSinceAccess / (1000 * 60 * 60) // Hours since last access

    return ageScore * 0.3 + accessScore * 0.4 + sizeScore * 0.1 + stalenessScore * 0.2
  }

  private estimateEntrySize(entry: CacheEntry): number {
    // Rough estimation of entry size in bytes
    return JSON.stringify(entry).length * 2 // UTF-16 encoding
  }

  private async findKeys(query: CacheQuery): Promise<string[]> {
    const allKeys = await this.storage.keys()
    const matchingKeys: string[] = []

    for (const key of allKeys) {
      if (query.keys && !query.keys.includes(key)) continue

      const entry = await this.storage.get(key)
      if (!entry) continue

      // Check expiration
      if (!query.includeExpired && this.isExpired(entry)) continue

      // Check tags
      if (query.tags && (!entry.tags || !query.tags.some((tag) => entry.tags!.has(tag)))) {
        continue
      }

      // Check domain
      if (query.domain) {
        try {
          const url = new URL(entry.metadata.originalRequest.url)
          if (url.hostname !== query.domain) continue
        } catch {
          continue
        }
      }

      // Check pattern
      if (query.pattern && !query.pattern.test(entry.metadata.originalRequest.url)) {
        continue
      }

      // Check max age
      if (query.maxAge && Date.now() - entry.createdAt > query.maxAge) {
        continue
      }

      matchingKeys.push(key)
    }

    return matchingKeys
  }

  private async calculateTotalSize(): Promise<number> {
    const keys = await this.storage.keys()
    let totalSize = 0

    for (const key of keys) {
      const entry = await this.storage.get(key)
      if (entry) {
        totalSize += this.estimateEntrySize(entry)
      }
    }

    return totalSize
  }

  private calculateCompressionRatio(): number {
    // Placeholder - would calculate actual compression ratio
    return 0.7 // 70% of original size
  }

  private calculateAverageResponseTime(): number {
    // Placeholder - would track and calculate response times
    return 150 // ms
  }

  private async compressLargeEntries(): Promise<void> {
    // Placeholder for optimizing large uncompressed entries
  }

  private async updateAccessPatterns(): Promise<void> {
    // Placeholder for access pattern analysis and optimization
  }

  private initializeStats(): CacheStats {
    return {
      totalEntries: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      compressionRatio: 0,
      averageResponseTime: 0
    }
  }

  private updateStats(entry: CacheEntry): void {
    // Update statistics when entry is added
    this.stats.totalEntries++
    this.stats.totalSize += this.estimateEntrySize(entry)
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanup()
    }, this.config.cleanupInterval)
  }
}

// ============================================================================
// Memory Storage Implementation
// ============================================================================

export class MemoryCacheStorage implements CacheStorage {
  private data = new Map<string, CacheEntry>()

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return (this.data.get(key) as CacheEntry<T>) || null
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<boolean> {
    this.data.set(key, entry as CacheEntry)
    return true
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async clear(): Promise<number> {
    const count = this.data.size
    this.data.clear()
    return count
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys())
  }

  async size(): Promise<number> {
    return this.data.size
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key)
  }
}

// ============================================================================
// Configuration Interface
// ============================================================================

export interface CacheConfig {
  defaultTtl: number // Default TTL in milliseconds
  maxTotalSize: number // Maximum total cache size in bytes
  maxEntrySize: number // Maximum single entry size in bytes
  maxEntries: number // Maximum number of entries
  enableCompression: boolean
  compressionThreshold: number // Minimum size for compression
  validateIntegrity: boolean
  cacheErrors: boolean // Whether to cache error responses
  enableAutoCleanup: boolean
  cleanupInterval: number // Cleanup interval in milliseconds
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createRequestCache(config: Partial<CacheConfig> = {}): RequestCache {
  const defaultConfig: CacheConfig = {
    defaultTtl: 15 * 60 * 1000, // 15 minutes
    maxTotalSize: 100 * 1024 * 1024, // 100MB
    maxEntrySize: 10 * 1024 * 1024, // 10MB
    maxEntries: 1000,
    enableCompression: true,
    compressionThreshold: 1024, // 1KB
    validateIntegrity: false,
    cacheErrors: false,
    enableAutoCleanup: true,
    cleanupInterval: 5 * 60 * 1000 // 5 minutes
  }

  const finalConfig = { ...defaultConfig, ...config }
  const storage = new MemoryCacheStorage()

  return new RequestCache(storage, finalConfig)
}

export function createRequestCacheFromSettings(settings: NetworkSettings): RequestCache {
  const config: Partial<CacheConfig> = {
    defaultTtl: settings.cacheDefaultTtlSeconds * 1000,
    enableCompression: settings.advanced?.enableCompression ?? true,
    maxEntrySize: settings.advanced?.maxResponseSizeBytes ?? 10 * 1024 * 1024
  }

  return createRequestCache(config)
}

export default RequestCache
