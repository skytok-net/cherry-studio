/**
 * Domain Reputation Service
 *
 * Provides domain reputation checking and threat intelligence services
 * for network security validation. Integrates with multiple reputation
 * providers and maintains local reputation cache.
 */

import type { DomainReputation, ReputationLevel } from '../../types/networkTypes'

// ============================================================================
// Core Interfaces
// ============================================================================

export interface ReputationProvider {
  name: string
  enabled: boolean
  priority: number
  timeout: number

  /**
   * Check domain reputation with this provider
   */
  checkDomain(domain: string): Promise<ProviderResult>

  /**
   * Check if provider is available
   */
  isAvailable(): Promise<boolean>

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig
}

export interface ProviderResult {
  provider: string
  domain: string
  level: ReputationLevel
  confidence: number
  categories: string[]
  threats: ThreatInfo[]
  metadata?: Record<string, any>
  timestamp: number
}

export interface ThreatInfo {
  type: 'malware' | 'phishing' | 'spam' | 'suspicious' | 'botnet' | 'c2'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  firstSeen?: number
  lastSeen?: number
  sources: string[]
}

export interface ProviderConfig {
  enabled?: boolean
  priority?: number
  apiKey?: string
  endpoint?: string
  rateLimit?: number
  cacheTimeout?: number
  retryCount?: number
  customHeaders?: Record<string, string>
  blacklistPath?: string
  whitelistPath?: string
}

export interface ReputationQuery {
  domain: string
  includeSubdomains?: boolean
  maxAge?: number // Maximum age of cached results in milliseconds
  providers?: string[] // Specific providers to query
  bypassCache?: boolean
}

export interface ReputationCacheEntry {
  domain: string
  reputation: DomainReputation
  providers: ProviderResult[]
  createdAt: number
  expiresAt: number
  hits: number
  lastAccessed: number
}

// ============================================================================
// Domain Reputation Service
// ============================================================================

export class DomainReputationService {
  private providers: Map<string, ReputationProvider>
  private cache: Map<string, ReputationCacheEntry>
  private config: ReputationServiceConfig
  private isInitialized: boolean = false

  constructor(config: ReputationServiceConfig) {
    this.providers = new Map()
    this.cache = new Map()
    this.config = config
  }

  /**
   * Initialize the reputation service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // Initialize built-in providers
    if (this.config.enableBuiltInProviders) {
      await this.initializeBuiltInProviders()
    }

    // Start cache cleanup interval
    this.startCacheCleanup()

    this.isInitialized = true
  }

  /**
   * Check domain reputation using all available providers
   */
  async checkDomain(query: ReputationQuery): Promise<DomainReputation> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const domain = this.normalizeDomain(query.domain)

    // Check cache first (unless bypassed)
    if (!query.bypassCache) {
      const cached = this.getCachedReputation(domain, query.maxAge)
      if (cached) {
        cached.hits++
        cached.lastAccessed = Date.now()
        return cached.reputation
      }
    }

    // Query providers
    const results = await this.queryProviders(query)

    // Aggregate results
    const reputation = this.aggregateResults(domain, results)

    // Cache the result
    this.cacheReputation(domain, reputation, results)

    return reputation
  }

  /**
   * Register a custom reputation provider
   */
  registerProvider(provider: ReputationProvider): void {
    this.providers.set(provider.name, provider)
  }

  /**
   * Unregister a reputation provider
   */
  unregisterProvider(providerName: string): boolean {
    return this.providers.delete(providerName)
  }

  /**
   * Get list of registered providers
   */
  getProviders(): ReputationProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Clear reputation cache
   */
  clearCache(domain?: string): number {
    if (domain) {
      const normalized = this.normalizeDomain(domain)
      const deleted = this.cache.delete(normalized)
      return deleted ? 1 : 0
    } else {
      const count = this.cache.size
      this.cache.clear()
      return count
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ReputationCacheStats {
    const entries = Array.from(this.cache.values())
    const now = Date.now()

    return {
      totalEntries: entries.length,
      validEntries: entries.filter((e) => e.expiresAt > now).length,
      expiredEntries: entries.filter((e) => e.expiresAt <= now).length,
      totalHits: entries.reduce((sum, e) => sum + e.hits, 0),
      averageAge: entries.length > 0 ? entries.reduce((sum, e) => sum + (now - e.createdAt), 0) / entries.length : 0,
      cacheSize: this.estimateCacheSize()
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<ReputationServiceConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Dispose of the service and cleanup resources
   */
  dispose(): void {
    this.cache.clear()
    this.providers.clear()
    this.isInitialized = false
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async initializeBuiltInProviders(): Promise<void> {
    // Note: These would be implemented in separate files in a real implementation
    // For now, we'll create placeholder implementations

    if (this.config.providers.safeBrowsing?.enabled) {
      const safeBrowsingProvider = new SafeBrowsingProvider(this.config.providers.safeBrowsing)
      this.registerProvider(safeBrowsingProvider)
    }

    if (this.config.providers.virusTotal?.enabled) {
      const virusTotalProvider = new VirusTotalProvider(this.config.providers.virusTotal)
      this.registerProvider(virusTotalProvider)
    }

    if (this.config.providers.local?.enabled) {
      const localProvider = new LocalReputationProvider(this.config.providers.local)
      this.registerProvider(localProvider)
    }
  }

  private async queryProviders(query: ReputationQuery): Promise<ProviderResult[]> {
    const providers = this.getActiveProviders(query.providers)
    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          const timeoutMs = provider.getConfig().cacheTimeout ?? this.config.cacheTimeoutMs
          const result = await Promise.race([provider.checkDomain(query.domain), this.createTimeoutPromise(timeoutMs)])
          return result
        } catch (error) {
          // Log error but don't fail the entire operation
          console.warn(`Provider ${provider.name} failed:`, error)
          return null
        }
      })
    )

    return results
      .filter(
        (result): result is PromiseFulfilledResult<ProviderResult> =>
          result.status === 'fulfilled' && result.value !== null
      )
      .map((result) => result.value)
  }

  private aggregateResults(domain: string, results: ProviderResult[]): DomainReputation {
    if (results.length === 0) {
      return {
        domain,
        level: 'unknown',
        confidence: 0,
        lastChecked: Date.now(),
        sources: [],
        metadata: {
          categories: [],
          historicalData: {
            firstSeen: Date.now(),
            requestCount: 1,
            failureRate: 0,
            averageResponseTime: 0
          }
        }
      }
    }

    // Aggregate threat levels using weighted scoring
    const scores = results.map((result) => ({
      level: result.level,
      confidence: result.confidence,
      weight: this.getProviderWeight(result.provider)
    }))

    const overallLevel = this.calculateOverallLevel(scores)
    const overallConfidence = this.calculateOverallConfidence(scores)

    // Collect all categories and threats
    const allCategories = new Set<string>()
    const allThreats = new Map<string, ThreatInfo>()

    results.forEach((result) => {
      result.categories.forEach((cat) => allCategories.add(cat))
      result.threats.forEach((threat) => {
        const key = `${threat.type}-${threat.description}`
        if (!allThreats.has(key) || threat.severity === 'critical') {
          allThreats.set(key, threat)
        }
      })
    })

    return {
      domain,
      level: overallLevel,
      confidence: overallConfidence,
      lastChecked: Date.now(),
      sources: results.map((r) => r.provider),
      metadata: {
        categories: Array.from(allCategories),
        threatIntelligence: {
          malwareCount: Array.from(allThreats.values()).filter((t) => t.type === 'malware').length,
          phishingCount: Array.from(allThreats.values()).filter((t) => t.type === 'phishing').length,
          spamCount: Array.from(allThreats.values()).filter((t) => t.type === 'spam').length,
          lastThreatDetected:
            Math.max(
              ...Array.from(allThreats.values())
                .filter((t) => t.lastSeen)
                .map((t) => t.lastSeen!),
              0
            ) || undefined
        },
        historicalData: {
          firstSeen: Date.now(),
          requestCount: 1,
          failureRate: 0,
          averageResponseTime: results.reduce((sum, r) => sum + (r.timestamp || 0), 0) / results.length
        }
      }
    }
  }

  private calculateOverallLevel(
    scores: Array<{ level: ReputationLevel; confidence: number; weight: number }>
  ): ReputationLevel {
    // Weight the scores and determine overall threat level
    let weightedScore = 0
    let totalWeight = 0

    const levelScores = {
      trusted: 1,
      unknown: 2,
      suspicious: 3,
      blocked: 4
    }

    scores.forEach((score) => {
      const levelScore = levelScores[score.level]
      const effectiveWeight = score.weight * (score.confidence / 100)
      weightedScore += levelScore * effectiveWeight
      totalWeight += effectiveWeight
    })

    if (totalWeight === 0) return 'unknown'

    const averageScore = weightedScore / totalWeight

    if (averageScore <= 1.5) return 'trusted'
    if (averageScore <= 2.5) return 'unknown'
    if (averageScore <= 3.5) return 'suspicious'
    return 'blocked'
  }

  private calculateOverallConfidence(
    scores: Array<{ level: ReputationLevel; confidence: number; weight: number }>
  ): number {
    if (scores.length === 0) return 0

    const weightedConfidence = scores.reduce((sum, score) => sum + score.confidence * score.weight, 0)
    const totalWeight = scores.reduce((sum, score) => sum + score.weight, 0)

    return totalWeight > 0 ? Math.round(weightedConfidence / totalWeight) : 0
  }

  private getProviderWeight(providerName: string): number {
    const provider = this.providers.get(providerName)
    return provider ? provider.priority : 1
  }

  private getActiveProviders(requestedProviders?: string[]): ReputationProvider[] {
    const providers = Array.from(this.providers.values())
      .filter((p) => p.enabled)
      .sort((a, b) => b.priority - a.priority)

    if (requestedProviders) {
      return providers.filter((p) => requestedProviders.includes(p.name))
    }

    return providers
  }

  private getCachedReputation(domain: string, maxAge?: number): ReputationCacheEntry | null {
    const entry = this.cache.get(domain)
    if (!entry) return null

    const now = Date.now()

    // Check if expired
    if (entry.expiresAt <= now) {
      this.cache.delete(domain)
      return null
    }

    // Check max age if specified
    if (maxAge && now - entry.createdAt > maxAge) {
      return null
    }

    return entry
  }

  private cacheReputation(domain: string, reputation: DomainReputation, results: ProviderResult[]): void {
    const entry: ReputationCacheEntry = {
      domain,
      reputation,
      providers: results,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.cacheTimeoutMs,
      hits: 0,
      lastAccessed: Date.now()
    }

    this.cache.set(domain, entry)
  }

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().trim()
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now()
      const expiredEntries: string[] = []

      this.cache.forEach((entry, domain) => {
        if (entry.expiresAt <= now) {
          expiredEntries.push(domain)
        }
      })

      expiredEntries.forEach((domain) => this.cache.delete(domain))
    }, this.config.cacheCleanupIntervalMs)
  }

  private estimateCacheSize(): number {
    // Rough estimation of cache size in bytes
    return Array.from(this.cache.values()).reduce((size, entry) => {
      return size + JSON.stringify(entry).length * 2 // UTF-16 encoding
    }, 0)
  }

  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Provider timeout')), timeoutMs)
    })
  }
}

// ============================================================================
// Placeholder Provider Implementations
// ============================================================================

class LocalReputationProvider implements ReputationProvider {
  name = 'local'
  enabled = true
  priority = 1
  timeout = 1000

  constructor(private config: ProviderConfig) {}

  async checkDomain(domain: string): Promise<ProviderResult> {
    // Placeholder implementation - would check local blacklists/whitelists
    return {
      provider: this.name,
      domain,
      level: 'unknown',
      confidence: 50,
      categories: [],
      threats: [],
      timestamp: Date.now()
    }
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  getConfig(): ProviderConfig {
    return this.config
  }
}

class SafeBrowsingProvider implements ReputationProvider {
  name = 'safebrowsing'
  enabled = true
  priority = 8
  timeout = 5000

  constructor(private config: ProviderConfig) {}

  async checkDomain(domain: string): Promise<ProviderResult> {
    // Placeholder - would integrate with Google Safe Browsing API
    return {
      provider: this.name,
      domain,
      level: 'unknown',
      confidence: 80,
      categories: [],
      threats: [],
      timestamp: Date.now()
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey
  }

  getConfig(): ProviderConfig {
    return this.config
  }
}

class VirusTotalProvider implements ReputationProvider {
  name = 'virustotal'
  enabled = true
  priority = 9
  timeout = 5000

  constructor(private config: ProviderConfig) {}

  async checkDomain(domain: string): Promise<ProviderResult> {
    // Placeholder - would integrate with VirusTotal API
    return {
      provider: this.name,
      domain,
      level: 'unknown',
      confidence: 85,
      categories: [],
      threats: [],
      timestamp: Date.now()
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey
  }

  getConfig(): ProviderConfig {
    return this.config
  }
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface ReputationServiceConfig {
  enableBuiltInProviders: boolean
  cacheTimeoutMs: number
  cacheCleanupIntervalMs: number
  maxCacheEntries: number

  providers: {
    local?: {
      enabled: boolean
      priority: number
      blacklistPath?: string
      whitelistPath?: string
    }
    safeBrowsing?: {
      enabled: boolean
      priority: number
      apiKey?: string
      endpoint?: string
    }
    virusTotal?: {
      enabled: boolean
      priority: number
      apiKey?: string
      endpoint?: string
    }
  }
}

export interface ReputationCacheStats {
  totalEntries: number
  validEntries: number
  expiredEntries: number
  totalHits: number
  averageAge: number
  cacheSize: number
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDomainReputationService(config: ReputationServiceConfig): DomainReputationService {
  return new DomainReputationService(config)
}

export default DomainReputationService
