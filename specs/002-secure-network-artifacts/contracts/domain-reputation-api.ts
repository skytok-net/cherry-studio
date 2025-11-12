/**
 * Domain Reputation API Contract
 *
 * Defines interfaces for domain reputation checking services
 * integrating with VirusTotal and Google Safe Browsing APIs.
 */

// ============================================================================
// Core Interfaces
// ============================================================================

export interface DomainReputationService {
  checkDomain(domain: string): Promise<ReputationResult>
  checkMultipleDomains(domains: string[]): Promise<ReputationResult[]>
  updateReputation(domain: string, force?: boolean): Promise<ReputationResult>
  getReputationHistory(domain: string): Promise<ReputationHistoryEntry[]>
}

export interface ReputationResult {
  domain: string
  level: ReputationLevel
  confidence: number
  lastChecked: number
  expiresAt: number
  sources: ReputationSource[]
  metadata: ReputationMetadata
}

export type ReputationLevel = 'trusted' | 'unknown' | 'suspicious' | 'blocked'

export interface ReputationSource {
  provider: ReputationProvider
  score: number
  verdict: string
  lastScan: number
  details?: ProviderDetails
}

export type ReputationProvider = 'virustotal' | 'google_safe_browsing' | 'internal'

export interface ReputationMetadata {
  categories: string[]
  malwareFamily?: string
  firstSeen?: number
  reportUrl?: string
  whitelisted: boolean
  scanStatistics?: ScanStatistics
}

export interface ScanStatistics {
  totalScans: number
  positiveScans: number
  engines: EngineResult[]
}

export interface EngineResult {
  engine: string
  version: string
  result: string
  detected: boolean
  updated: number
}

export interface ReputationHistoryEntry {
  timestamp: number
  level: ReputationLevel
  confidence: number
  provider: ReputationProvider
  changeReason?: string
}

// ============================================================================
// Provider-Specific Interfaces
// ============================================================================

export interface VirusTotalConfig {
  apiKey: string
  baseUrl: string
  rateLimitPerMinute: number
  timeoutMs: number
}

export interface GoogleSafeBrowsingConfig {
  apiKey: string
  baseUrl: string
  threatTypes: SafeBrowsingThreatType[]
  clientId: string
}

export type SafeBrowsingThreatType =
  | 'MALWARE'
  | 'SOCIAL_ENGINEERING'
  | 'UNWANTED_SOFTWARE'
  | 'POTENTIALLY_HARMFUL_APPLICATION'

export interface ProviderDetails {
  virustotal?: VirusTotalDetails
  googleSafeBrowsing?: SafeBrowsingDetails
}

export interface VirusTotalDetails {
  scanId: string
  permalink: string
  scanDate: number
  totalEngines: number
  positiveDetections: number
  scans: Record<string, VirusTotalScan>
}

export interface VirusTotalScan {
  detected: boolean
  version: string
  result: string
  update: string
}

export interface SafeBrowsingDetails {
  threatType: SafeBrowsingThreatType
  platformType: string
  threatEntryType: string
  cacheDuration: string
}

// ============================================================================
// Cache Interface
// ============================================================================

export interface ReputationCache {
  get(domain: string): Promise<ReputationResult | null>
  set(domain: string, result: ReputationResult, ttlSeconds?: number): Promise<void>
  delete(domain: string): Promise<boolean>
  clear(): Promise<number>
  getStats(): Promise<CacheStats>
}

export interface CacheStats {
  totalEntries: number
  hitRate: number
  avgLookupTime: number
  memoryUsage: number
  oldestEntry: number
  newestEntry: number
}

// ============================================================================
// API Response Types
// ============================================================================

export interface DomainReputationResponse {
  success: boolean
  result?: ReputationResult
  error?: {
    code: string
    message: string
    details?: Record<string, any>
  }
  requestId: string
  timestamp: number
}

export interface BatchReputationResponse {
  success: boolean
  results: ReputationResult[]
  errors: Array<{
    domain: string
    code: string
    message: string
  }>
  requestId: string
  timestamp: number
}

// ============================================================================
// Configuration
// ============================================================================

export interface ReputationServiceConfig {
  providers: {
    virustotal: VirusTotalConfig
    googleSafeBrowsing: GoogleSafeBrowsingConfig
  }
  cache: {
    enabled: boolean
    defaultTtlSeconds: number
    maxEntries: number
    cleanupIntervalMinutes: number
  }
  fallback: {
    enableFallback: boolean
    fallbackLevel: ReputationLevel
    requiredProviders: number
  }
  logging: {
    enableRequestLogging: boolean
    enableResponseLogging: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
}

// ============================================================================
// Error Types
// ============================================================================

export const ReputationErrorCodes = {
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  API_KEY_INVALID: 'API_KEY_INVALID',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const

export type ReputationErrorCode = (typeof ReputationErrorCodes)[keyof typeof ReputationErrorCodes]

export class ReputationError extends Error {
  constructor(
    public code: ReputationErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'ReputationError'
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function normalizeDomain(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

export function calculateConfidence(sources: ReputationSource[]): number {
  if (sources.length === 0) return 0

  const weights = {
    virustotal: 0.6,
    google_safe_browsing: 0.4,
    internal: 0.2
  }

  let totalWeight = 0
  let weightedScore = 0

  for (const source of sources) {
    const weight = weights[source.provider] || 0.1
    totalWeight += weight
    weightedScore += source.score * weight
  }

  return Math.min(1, weightedScore / totalWeight)
}

export function determineReputationLevel(sources: ReputationSource[], confidence: number): ReputationLevel {
  if (confidence < 0.3) return 'unknown'

  const hasBlocked = sources.some((s) => s.verdict === 'malicious' && s.score > 0.7)
  if (hasBlocked) return 'blocked'

  const hasSuspicious = sources.some((s) => s.verdict === 'suspicious' && s.score > 0.5)
  if (hasSuspicious) return 'suspicious'

  const hasTrusted = sources.some((s) => s.verdict === 'clean' && s.score < 0.2)
  if (hasTrusted && confidence > 0.8) return 'trusted'

  return 'unknown'
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_REPUTATION_CONFIG: ReputationServiceConfig = {
  providers: {
    virustotal: {
      apiKey: '', // To be configured
      baseUrl: 'https://www.virustotal.com/vtapi/v2',
      rateLimitPerMinute: 4,
      timeoutMs: 10000
    },
    googleSafeBrowsing: {
      apiKey: '', // To be configured
      baseUrl: 'https://safebrowsing.googleapis.com/v4',
      threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
      clientId: 'cherry-studio'
    }
  },
  cache: {
    enabled: true,
    defaultTtlSeconds: 86400, // 24 hours
    maxEntries: 10000,
    cleanupIntervalMinutes: 60
  },
  fallback: {
    enableFallback: true,
    fallbackLevel: 'unknown',
    requiredProviders: 1
  },
  logging: {
    enableRequestLogging: true,
    enableResponseLogging: false,
    logLevel: 'info'
  }
}
