/**
 * Security Policy Service
 *
 * Manages security policies for network requests, including domain validation,
 * private network access controls, and security violation handling.
 */

import type { NetworkRequest, NetworkSettings, SecurityViolation } from '../../types/networkTypes'

// ============================================================================
// Security Policy Configuration
// ============================================================================

export interface SecurityPolicyConfig {
  // Core security settings
  enableDomainReputation: boolean
  blockPrivateNetworks: boolean
  enforceHttpsOnly: boolean
  maxRequestsPerMinute: number
  maxConcurrentRequests: number

  // Domain-specific rules
  whitelistedDomains: Set<string>
  blacklistedDomains: Set<string>
  trustedDomains: Set<string>

  // Port and protocol restrictions
  allowedProtocols: Set<string>
  blockedPorts: Set<number>

  // Enforcement levels
  enforcementLevel: 'strict' | 'moderate' | 'permissive'

  // Advanced security features
  advanced: {
    enableContentSizeLimit: boolean
    maxResponseSizeBytes: number
    enableUserAgentValidation: boolean
    requireSecureHeaders: boolean
    blockSuspiciousDomains: boolean
    enableRateLimitByArtifact: boolean
    enableGeoBlocking: boolean
    blockedCountries: Set<string>
    enableMalwareScanning: boolean
    scanTimeoutMs: number
  }
}

export interface SecurityRule {
  id: string
  name: string
  description: string
  type: 'allow' | 'block' | 'warn'
  priority: number
  enabled: boolean
  conditions: SecurityCondition[]
  actions: SecurityAction[]
  metadata?: {
    createdAt: number
    updatedAt: number
    createdBy: string
    tags?: string[]
  }
}

export interface SecurityCondition {
  type: 'domain' | 'url_pattern' | 'ip_range' | 'port' | 'method' | 'header' | 'body_size' | 'reputation'
  operator: 'equals' | 'contains' | 'matches' | 'in_range' | 'greater_than' | 'less_than'
  value: string | number | string[]
  caseSensitive?: boolean
}

export interface SecurityAction {
  type: 'block' | 'allow' | 'log' | 'alert' | 'rate_limit' | 'redirect'
  parameters?: Record<string, any>
  message?: string
}

// ============================================================================
// Security Policy Class
// ============================================================================

export class SecurityPolicy {
  private config: SecurityPolicyConfig
  private customRules: SecurityRule[]
  private sessionOverrides: Map<string, SessionOverride>

  constructor(settings: NetworkSettings) {
    this.config = this.createConfigFromSettings(settings)
    this.customRules = []
    this.sessionOverrides = new Map()
  }

  /**
   * Validate a network request against security policies
   */
  async validateRequest(request: NetworkRequest): Promise<SecurityValidationResult> {
    const violations: SecurityViolation[] = []
    const warnings: string[] = []

    try {
      const url = new URL(request.url)
      const domain = url.hostname
      const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80)

      // Check session overrides first
      const override = this.getSessionOverride(domain)
      if (override && override.expiresAt > Date.now()) {
        return {
          allowed: true,
          violations: [],
          warnings: [`Domain ${domain} allowed via session override: ${override.reason}`],
          requiresUserApproval: false,
          metadata: { overrideApplied: true }
        }
      }

      // 1. Protocol validation
      if (!this.config.allowedProtocols.has(url.protocol)) {
        violations.push({
          requestId: request.id,
          violationType: 'invalid_protocol',
          message: `Protocol ${url.protocol} is not allowed`,
          canOverride: this.config.enforcementLevel !== 'strict',
          timestamp: Date.now(),
          metadata: {
            artifactId: request.artifactId,
            url: request.url,
            severity: 'high',
            riskScore: 8,
            detectionSource: ['protocol_validator']
          }
        })
      }

      // 2. HTTPS enforcement
      if (this.config.enforceHttpsOnly && url.protocol !== 'https:') {
        violations.push({
          requestId: request.id,
          violationType: 'invalid_protocol',
          message: 'HTTPS is required for all requests',
          canOverride: this.config.enforcementLevel === 'permissive',
          overrideInstructions: 'Contact administrator to allow HTTP requests',
          timestamp: Date.now(),
          metadata: {
            artifactId: request.artifactId,
            url: request.url,
            severity: 'medium',
            riskScore: 6,
            detectionSource: ['https_enforcer']
          }
        })
      }

      // 3. Port validation
      if (this.config.blockedPorts.has(port)) {
        violations.push({
          requestId: request.id,
          violationType: 'blocked_port',
          message: `Port ${port} is blocked for security reasons`,
          canOverride: false,
          timestamp: Date.now(),
          metadata: {
            artifactId: request.artifactId,
            url: request.url,
            severity: 'critical',
            riskScore: 10,
            detectionSource: ['port_validator']
          }
        })
      }

      // 4. Domain blacklist check
      if (this.config.blacklistedDomains.has(domain)) {
        violations.push({
          requestId: request.id,
          violationType: 'malicious_domain',
          message: `Domain ${domain} is blacklisted`,
          canOverride: this.config.enforcementLevel === 'permissive',
          timestamp: Date.now(),
          metadata: {
            artifactId: request.artifactId,
            url: request.url,
            severity: 'critical',
            riskScore: 10,
            detectionSource: ['domain_blacklist']
          }
        })
      }

      // 5. Private network check
      if (this.config.blockPrivateNetworks && this.isPrivateNetwork(url)) {
        violations.push({
          requestId: request.id,
          violationType: 'private_network',
          message: `Access to private network address ${domain} is blocked`,
          canOverride: true,
          overrideInstructions: 'Confirm that you trust this private network address',
          timestamp: Date.now(),
          metadata: {
            artifactId: request.artifactId,
            url: request.url,
            severity: 'high',
            riskScore: 8,
            detectionSource: ['private_network_detector'],
            userContext: {
              sessionId: this.generateSessionId(),
              trustLevel: 'new'
            }
          }
        })
      }

      // 6. Domain whitelist check (if violations exist)
      if (violations.length > 0 && this.config.whitelistedDomains.has(domain)) {
        return {
          allowed: true,
          violations: [],
          warnings: [`Domain ${domain} allowed via whitelist`],
          requiresUserApproval: false,
          metadata: { whitelistApplied: true }
        }
      }

      // 7. Apply custom rules
      const customResults = await this.applyCustomRules(request)
      violations.push(...customResults.violations)
      warnings.push(...customResults.warnings)

      // Determine final result
      const blocked = violations.some((v) => !v.canOverride)
      const requiresApproval = violations.some((v) => v.canOverride) && !blocked

      return {
        allowed: violations.length === 0,
        violations,
        warnings,
        requiresUserApproval: requiresApproval,
        metadata: {
          rulesEvaluated: this.customRules.length + 6,
          enforcementLevel: this.config.enforcementLevel
        }
      }
    } catch (error) {
      return {
        allowed: false,
        violations: [
          {
            requestId: request.id,
            violationType: 'invalid_protocol',
            message: `Invalid URL format: ${error instanceof Error ? error.message : String(error)}`,
            canOverride: false,
            timestamp: Date.now(),
            metadata: {
              artifactId: request.artifactId,
              url: request.url,
              severity: 'high',
              riskScore: 8,
              detectionSource: ['url_parser']
            }
          }
        ],
        warnings: [],
        requiresUserApproval: false,
        metadata: { parseError: true }
      }
    }
  }

  /**
   * Create session override for blocked domain
   */
  createSessionOverride(domain: string, reason: string, durationMs: number = 3600000): SessionOverride {
    const override: SessionOverride = {
      domain,
      reason,
      createdAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      sessionId: this.generateSessionId()
    }

    this.sessionOverrides.set(domain, override)
    return override
  }

  /**
   * Update security configuration
   */
  updateConfig(settings: NetworkSettings): void {
    this.config = this.createConfigFromSettings(settings)
  }

  /**
   * Add custom security rule
   */
  addCustomRule(rule: SecurityRule): void {
    this.customRules.push(rule)
    this.customRules.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Remove custom security rule
   */
  removeCustomRule(ruleId: string): boolean {
    const index = this.customRules.findIndex((rule) => rule.id === ruleId)
    if (index >= 0) {
      this.customRules.splice(index, 1)
      return true
    }
    return false
  }

  /**
   * Get current security configuration
   */
  getConfig(): SecurityPolicyConfig {
    return { ...this.config }
  }

  /**
   * Get active custom rules
   */
  getCustomRules(): SecurityRule[] {
    return this.customRules.filter((rule) => rule.enabled)
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createConfigFromSettings(settings: NetworkSettings): SecurityPolicyConfig {
    return {
      enableDomainReputation: settings.enableReputationCheck,
      blockPrivateNetworks: !settings.allowPrivateNetworks,
      enforceHttpsOnly: settings.enforcementLevel === 'strict',
      maxRequestsPerMinute: settings.rateLimitPerMinute,
      maxConcurrentRequests: settings.maxConcurrentRequests,

      whitelistedDomains: new Set([
        'api.openweathermap.org',
        'jsonplaceholder.typicode.com',
        'httpbin.org',
        'api.github.com'
      ]),
      blacklistedDomains: new Set(),
      trustedDomains: new Set(['api.openweathermap.org', 'api.github.com']),

      allowedProtocols: new Set(['http:', 'https:']),
      blockedPorts: new Set([22, 23, 25, 53, 135, 139, 445, 1433, 1521, 3306, 3389, 5432]),

      enforcementLevel: settings.enforcementLevel,

      advanced: {
        enableContentSizeLimit: true,
        maxResponseSizeBytes: settings.advanced?.maxResponseSizeBytes || 10 * 1024 * 1024,
        enableUserAgentValidation: false,
        requireSecureHeaders: settings.enforcementLevel === 'strict',
        blockSuspiciousDomains: settings.enableReputationCheck,
        enableRateLimitByArtifact: true,
        enableGeoBlocking: false,
        blockedCountries: new Set(),
        enableMalwareScanning: settings.enableReputationCheck,
        scanTimeoutMs: 5000
      }
    }
  }

  private isPrivateNetwork(url: URL): boolean {
    const hostname = url.hostname

    // Private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc[0-9a-f]{2}:/i,
      /^fe80:/i
    ]

    // Localhost patterns
    if (hostname === 'localhost' || hostname === '0.0.0.0') {
      return true
    }

    return privateRanges.some((range) => range.test(hostname))
  }

  private async applyCustomRules(request: NetworkRequest): Promise<{
    violations: SecurityViolation[]
    warnings: string[]
  }> {
    const violations: SecurityViolation[] = []
    const warnings: string[] = []

    for (const rule of this.getCustomRules()) {
      const matches = this.evaluateRuleConditions(rule.conditions, request)

      if (matches) {
        for (const action of rule.actions) {
          switch (action.type) {
            case 'block':
              violations.push({
                requestId: request.id,
                violationType: 'malicious_domain',
                message: action.message || `Blocked by custom rule: ${rule.name}`,
                canOverride: rule.type !== 'block',
                timestamp: Date.now(),
                metadata: {
                  artifactId: request.artifactId,
                  url: request.url,
                  severity: 'medium',
                  riskScore: 6,
                  detectionSource: ['custom_rule'],
                  evidence: { ruleId: rule.id, ruleName: rule.name }
                }
              })
              break
            case 'log':
              warnings.push(`Custom rule triggered: ${rule.name}`)
              break
          }
        }
      }
    }

    return { violations, warnings }
  }

  private evaluateRuleConditions(conditions: SecurityCondition[], request: NetworkRequest): boolean {
    // For now, implement basic condition evaluation
    // This would be expanded with more sophisticated rule evaluation
    return conditions.every((condition) => {
      try {
        const url = new URL(request.url)

        switch (condition.type) {
          case 'domain':
            return this.evaluateStringCondition(url.hostname, condition)
          case 'url_pattern':
            return this.evaluateStringCondition(request.url, condition)
          case 'method':
            return this.evaluateStringCondition(request.method, condition)
          default:
            return true
        }
      } catch {
        return false
      }
    })
  }

  private evaluateStringCondition(value: string, condition: SecurityCondition): boolean {
    const conditionValue = condition.value as string
    const testValue = condition.caseSensitive ? value : value.toLowerCase()
    const testCondition = condition.caseSensitive ? conditionValue : conditionValue.toLowerCase()

    switch (condition.operator) {
      case 'equals':
        return testValue === testCondition
      case 'contains':
        return testValue.includes(testCondition)
      case 'matches':
        return new RegExp(testCondition).test(testValue)
      default:
        return false
    }
  }

  private getSessionOverride(domain: string): SessionOverride | undefined {
    return this.sessionOverrides.get(domain)
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

export interface SecurityValidationResult {
  allowed: boolean
  violations: SecurityViolation[]
  warnings: string[]
  requiresUserApproval: boolean
  metadata?: Record<string, any>
}

export interface SessionOverride {
  domain: string
  reason: string
  createdAt: number
  expiresAt: number
  sessionId: string
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSecurityPolicy(settings: NetworkSettings): SecurityPolicy {
  return new SecurityPolicy(settings)
}

export default SecurityPolicy
