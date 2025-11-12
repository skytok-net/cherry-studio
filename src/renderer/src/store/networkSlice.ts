/**
 * Network State Slice
 *
 * Redux state management for network requests, settings, and security events
 * in the renderer process. Manages the state of network-enabled artifacts.
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type {
  NetworkRequest,
  NetworkResponse,
  NetworkSettings,
  NetworkStats,
  DomainReputation,
  SecurityViolation,
  RequestStatus
} from '../../../main/types/networkTypes'

// ============================================================================
// State Interface
// ============================================================================

export interface NetworkRequestState {
  id: string
  request: NetworkRequest
  status: RequestStatus
  response?: NetworkResponse
  error?: string
  progress?: number
  timestamp: number
}

export interface NetworkState {
  // Active network requests
  requests: Record<string, NetworkRequestState>

  // Network settings
  settings: NetworkSettings | null

  // Domain reputation cache
  domainReputations: Record<string, DomainReputation>

  // Network statistics
  stats: NetworkStats | null

  // Security violations
  securityViolations: SecurityViolation[]

  // Rate limiting information
  rateLimits: Record<string, {
    remaining: number
    resetTime: number
    retryAfter?: number
  }>

  // Session overrides for security blocks
  sessionOverrides: Record<string, {
    domain: string
    reason: string
    expiresAt: number
    grantedAt: number
  }>

  // Cache status
  cacheStatus: {
    totalEntries: number
    hitRate: number
    lastCleared?: number
  }

  // Loading states
  loading: {
    settings: boolean
    stats: boolean
    domainCheck: boolean
    cacheOperation: boolean
  }

  // Error states
  errors: {
    settings?: string
    stats?: string
    domainCheck?: string
    cacheOperation?: string
    general?: string
  }

  // Connection status
  connectionStatus: {
    online: boolean
    lastChecked: number
  }
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: NetworkState = {
  requests: {},
  settings: null,
  domainReputations: {},
  stats: null,
  securityViolations: [],
  rateLimits: {},
  sessionOverrides: {},
  cacheStatus: {
    totalEntries: 0,
    hitRate: 0
  },
  loading: {
    settings: false,
    stats: false,
    domainCheck: false,
    cacheOperation: false
  },
  errors: {},
  connectionStatus: {
    online: true,
    lastChecked: Date.now()
  }
}

// ============================================================================
// Async Thunks
// ============================================================================

export const fetchNetworkSettings = createAsyncThunk(
  'network/fetchSettings',
  async () => {
    const settings = await window.networkApi.getSettings()
    return settings
  }
)

export const updateNetworkSettings = createAsyncThunk(
  'network/updateSettings',
  async (settings: Partial<NetworkSettings>) => {
    const updatedSettings = await window.networkApi.updateSettings(settings)
    return updatedSettings
  }
)

export const fetchNetworkStats = createAsyncThunk(
  'network/fetchStats',
  async () => {
    const stats = await window.networkApi.getStats()
    return stats
  }
)

export const checkDomainReputation = createAsyncThunk(
  'network/checkDomain',
  async (domain: string) => {
    const reputation = await window.networkApi.checkDomain(domain)
    return { domain, reputation }
  }
)

export const makeNetworkRequest = createAsyncThunk(
  'network/makeRequest',
  async (request: NetworkRequest, { dispatch }) => {
    // Add request to state as pending
    dispatch(addNetworkRequest({
      id: request.id,
      request,
      status: 'pending',
      timestamp: Date.now()
    }))

    try {
      // Update status to executing
      dispatch(updateRequestStatus({ id: request.id, status: 'executing' }))

      // Make the actual request
      const response = await window.networkApi.makeRequest(request)

      return { requestId: request.id, response }
    } catch (error) {
      // Error will be handled in rejected case
      throw error
    }
  }
)

export const clearRequestCache = createAsyncThunk(
  'network/clearCache',
  async (domain?: string) => {
    const clearedCount = await window.networkApi.clearCache(domain)
    return { domain, clearedCount }
  }
)

export const overrideSecurityBlock = createAsyncThunk(
  'network/overrideBlock',
  async ({ domain, reason }: { domain: string; reason: string }) => {
    const result = await window.networkApi.overrideBlock(domain, reason)
    return { domain, result }
  }
)

export const cancelNetworkRequest = createAsyncThunk(
  'network/cancelRequest',
  async (requestId: string, { dispatch }) => {
    // Update status to cancelled in state
    dispatch(updateRequestStatus({ id: requestId, status: 'failed' }))
    dispatch(updateRequestError({ id: requestId, error: 'Request cancelled by user' }))

    // Attempt to cancel on backend (if supported)
    try {
      await window.networkApi.cancelRequest?.(requestId)
    } catch (error) {
      // Cancellation failed, but we've already updated the state
      console.warn('Failed to cancel request on backend:', error)
    }

    return requestId
  }
)

// ============================================================================
// Slice Definition
// ============================================================================

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    // Request management
    addNetworkRequest: (state, action: PayloadAction<NetworkRequestState>) => {
      state.requests[action.payload.id] = action.payload
    },

    updateRequestStatus: (state, action: PayloadAction<{
      id: string
      status: RequestStatus
      progress?: number
    }>) => {
      const request = state.requests[action.payload.id]
      if (request) {
        request.status = action.payload.status
        if (action.payload.progress !== undefined) {
          request.progress = action.payload.progress
        }
      }
    },

    updateRequestResponse: (state, action: PayloadAction<{
      id: string
      response: NetworkResponse
    }>) => {
      const request = state.requests[action.payload.id]
      if (request) {
        request.response = action.payload.response
        request.status = action.payload.response.fromCache ? 'cached' : 'completed'
      }
    },

    updateRequestError: (state, action: PayloadAction<{
      id: string
      error: string
    }>) => {
      const request = state.requests[action.payload.id]
      if (request) {
        request.error = action.payload.error
        request.status = 'failed'
      }
    },

    removeNetworkRequest: (state, action: PayloadAction<string>) => {
      delete state.requests[action.payload]
    },

    clearNetworkRequests: (state) => {
      state.requests = {}
    },

    // Security violations
    addSecurityViolation: (state, action: PayloadAction<SecurityViolation>) => {
      state.securityViolations.push(action.payload)
    },

    removeSecurityViolation: (state, action: PayloadAction<string>) => {
      state.securityViolations = state.securityViolations.filter(
        v => v.requestId !== action.payload
      )
    },

    clearSecurityViolations: (state) => {
      state.securityViolations = []
    },

    // Domain reputation cache
    updateDomainReputation: (state, action: PayloadAction<{
      domain: string
      reputation: DomainReputation
    }>) => {
      state.domainReputations[action.payload.domain] = action.payload.reputation
    },

    // Rate limiting
    updateRateLimit: (state, action: PayloadAction<{
      key: string
      remaining: number
      resetTime: number
      retryAfter?: number
    }>) => {
      state.rateLimits[action.payload.key] = {
        remaining: action.payload.remaining,
        resetTime: action.payload.resetTime,
        retryAfter: action.payload.retryAfter
      }
    },

    removeRateLimit: (state, action: PayloadAction<string>) => {
      delete state.rateLimits[action.payload]
    },

    // Session overrides
    addSessionOverride: (state, action: PayloadAction<{
      domain: string
      reason: string
      expiresAt: number
    }>) => {
      state.sessionOverrides[action.payload.domain] = {
        domain: action.payload.domain,
        reason: action.payload.reason,
        expiresAt: action.payload.expiresAt,
        grantedAt: Date.now()
      }
    },

    removeSessionOverride: (state, action: PayloadAction<string>) => {
      delete state.sessionOverrides[action.payload]
    },

    cleanupExpiredOverrides: (state) => {
      const now = Date.now()
      Object.keys(state.sessionOverrides).forEach(domain => {
        if (state.sessionOverrides[domain].expiresAt < now) {
          delete state.sessionOverrides[domain]
        }
      })
    },

    // Cache status
    updateCacheStatus: (state, action: PayloadAction<{
      totalEntries?: number
      hitRate?: number
      lastCleared?: number
    }>) => {
      if (action.payload.totalEntries !== undefined) {
        state.cacheStatus.totalEntries = action.payload.totalEntries
      }
      if (action.payload.hitRate !== undefined) {
        state.cacheStatus.hitRate = action.payload.hitRate
      }
      if (action.payload.lastCleared !== undefined) {
        state.cacheStatus.lastCleared = action.payload.lastCleared
      }
    },

    // Connection status
    updateConnectionStatus: (state, action: PayloadAction<{
      online: boolean
    }>) => {
      state.connectionStatus.online = action.payload.online
      state.connectionStatus.lastChecked = Date.now()
    },

    // Error handling
    setError: (state, action: PayloadAction<{
      type: keyof NetworkState['errors']
      error: string
    }>) => {
      state.errors[action.payload.type] = action.payload.error
    },

    clearError: (state, action: PayloadAction<keyof NetworkState['errors']>) => {
      delete state.errors[action.payload]
    },

    clearAllErrors: (state) => {
      state.errors = {}
    }
  },

  extraReducers: (builder) => {
    // Fetch network settings
    builder
      .addCase(fetchNetworkSettings.pending, (state) => {
        state.loading.settings = true
        delete state.errors.settings
      })
      .addCase(fetchNetworkSettings.fulfilled, (state, action) => {
        state.loading.settings = false
        state.settings = action.payload
      })
      .addCase(fetchNetworkSettings.rejected, (state, action) => {
        state.loading.settings = false
        state.errors.settings = action.error.message || 'Failed to fetch network settings'
      })

    // Update network settings
    builder
      .addCase(updateNetworkSettings.pending, (state) => {
        state.loading.settings = true
        delete state.errors.settings
      })
      .addCase(updateNetworkSettings.fulfilled, (state, action) => {
        state.loading.settings = false
        state.settings = action.payload
      })
      .addCase(updateNetworkSettings.rejected, (state, action) => {
        state.loading.settings = false
        state.errors.settings = action.error.message || 'Failed to update network settings'
      })

    // Fetch network stats
    builder
      .addCase(fetchNetworkStats.pending, (state) => {
        state.loading.stats = true
        delete state.errors.stats
      })
      .addCase(fetchNetworkStats.fulfilled, (state, action) => {
        state.loading.stats = false
        state.stats = action.payload
      })
      .addCase(fetchNetworkStats.rejected, (state, action) => {
        state.loading.stats = false
        state.errors.stats = action.error.message || 'Failed to fetch network stats'
      })

    // Check domain reputation
    builder
      .addCase(checkDomainReputation.pending, (state) => {
        state.loading.domainCheck = true
        delete state.errors.domainCheck
      })
      .addCase(checkDomainReputation.fulfilled, (state, action) => {
        state.loading.domainCheck = false
        state.domainReputations[action.payload.domain] = action.payload.reputation
      })
      .addCase(checkDomainReputation.rejected, (state, action) => {
        state.loading.domainCheck = false
        state.errors.domainCheck = action.error.message || 'Failed to check domain reputation'
      })

    // Make network request
    builder
      .addCase(makeNetworkRequest.fulfilled, (state, action) => {
        const request = state.requests[action.payload.requestId]
        if (request) {
          request.response = action.payload.response
          request.status = action.payload.response.fromCache ? 'cached' : 'completed'
        }
      })
      .addCase(makeNetworkRequest.rejected, (state, action) => {
        const requestId = action.meta.arg.id
        const request = state.requests[requestId]
        if (request) {
          request.error = action.error.message || 'Network request failed'
          request.status = 'failed'
        }
      })

    // Clear request cache
    builder
      .addCase(clearRequestCache.pending, (state) => {
        state.loading.cacheOperation = true
        delete state.errors.cacheOperation
      })
      .addCase(clearRequestCache.fulfilled, (state, action) => {
        state.loading.cacheOperation = false
        state.cacheStatus.lastCleared = Date.now()
        if (action.payload.clearedCount > 0) {
          state.cacheStatus.totalEntries = Math.max(0, state.cacheStatus.totalEntries - action.payload.clearedCount)
        }
      })
      .addCase(clearRequestCache.rejected, (state, action) => {
        state.loading.cacheOperation = false
        state.errors.cacheOperation = action.error.message || 'Failed to clear cache'
      })

    // Override security block
    builder
      .addCase(overrideSecurityBlock.fulfilled, (state, action) => {
        const { domain, result } = action.payload
        state.sessionOverrides[domain] = {
          domain,
          reason: action.meta.arg.reason,
          expiresAt: result.expiresAt,
          grantedAt: Date.now()
        }

        // Remove related security violations
        state.securityViolations = state.securityViolations.filter(
          violation => !violation.metadata?.url?.includes(domain)
        )
      })

    // Cancel network request
    builder
      .addCase(cancelNetworkRequest.fulfilled, (state, action) => {
        const request = state.requests[action.payload]
        if (request) {
          request.status = 'failed'
          request.error = 'Request cancelled by user'
        }
      })
  }
})

// ============================================================================
// Exports
// ============================================================================

export const {
  addNetworkRequest,
  updateRequestStatus,
  updateRequestResponse,
  updateRequestError,
  removeNetworkRequest,
  clearNetworkRequests,
  addSecurityViolation,
  removeSecurityViolation,
  clearSecurityViolations,
  updateDomainReputation,
  updateRateLimit,
  removeRateLimit,
  addSessionOverride,
  removeSessionOverride,
  cleanupExpiredOverrides,
  updateCacheStatus,
  updateConnectionStatus,
  setError,
  clearError,
  clearAllErrors
} = networkSlice.actions

export default networkSlice.reducer

// ============================================================================
// Selectors
// ============================================================================

export const selectNetworkRequests = (state: { network: NetworkState }) => state.network.requests
export const selectNetworkSettings = (state: { network: NetworkState }) => state.network.settings
export const selectNetworkStats = (state: { network: NetworkState }) => state.network.stats
export const selectDomainReputations = (state: { network: NetworkState }) => state.network.domainReputations
export const selectSecurityViolations = (state: { network: NetworkState }) => state.network.securityViolations
export const selectRateLimits = (state: { network: NetworkState }) => state.network.rateLimits
export const selectSessionOverrides = (state: { network: NetworkState }) => state.network.sessionOverrides
export const selectCacheStatus = (state: { network: NetworkState }) => state.network.cacheStatus
export const selectConnectionStatus = (state: { network: NetworkState }) => state.network.connectionStatus
export const selectNetworkLoading = (state: { network: NetworkState }) => state.network.loading
export const selectNetworkErrors = (state: { network: NetworkState }) => state.network.errors

// Request-specific selectors
export const selectRequestById = (requestId: string) =>
  (state: { network: NetworkState }) => state.network.requests[requestId]

export const selectActiveRequests = (state: { network: NetworkState }) =>
  Object.values(state.network.requests).filter(
    req => req.status === 'pending' || req.status === 'executing' || req.status === 'validating'
  )

export const selectCompletedRequests = (state: { network: NetworkState }) =>
  Object.values(state.network.requests).filter(
    req => req.status === 'completed' || req.status === 'cached'
  )

export const selectFailedRequests = (state: { network: NetworkState }) =>
  Object.values(state.network.requests).filter(req => req.status === 'failed')

export const selectRequestsByArtifact = (artifactId: string) =>
  (state: { network: NetworkState }) =>
    Object.values(state.network.requests).filter(req => req.request.artifactId === artifactId)

// Rate limit selectors
export const selectRateLimitForDomain = (domain: string) =>
  (state: { network: NetworkState }) => state.network.rateLimits[domain]

export const selectIsRateLimited = (domain: string) =>
  (state: { network: NetworkState }) => {
    const rateLimit = state.network.rateLimits[domain]
    return rateLimit ? rateLimit.remaining <= 0 && Date.now() < rateLimit.resetTime : false
  }

// Session override selectors
export const selectSessionOverrideForDomain = (domain: string) =>
  (state: { network: NetworkState }) => state.network.sessionOverrides[domain]

export const selectActiveSessionOverrides = (state: { network: NetworkState }) =>
  Object.values(state.network.sessionOverrides).filter(override =>
    Date.now() < override.expiresAt
  )

// Security violation selectors
export const selectSecurityViolationsByArtifact = (artifactId: string) =>
  (state: { network: NetworkState }) =>
    state.network.securityViolations.filter(violation =>
      violation.metadata?.artifactId === artifactId
    )

export const selectCriticalSecurityViolations = (state: { network: NetworkState }) =>
  state.network.securityViolations.filter(violation =>
    violation.metadata?.severity === 'critical'
  )

// Connection and cache selectors
export const selectIsOnline = (state: { network: NetworkState }) =>
  state.network.connectionStatus.online

export const selectCacheEfficiency = (state: { network: NetworkState }) => ({
  hitRate: state.network.cacheStatus.hitRate,
  totalEntries: state.network.cacheStatus.totalEntries,
  lastCleared: state.network.cacheStatus.lastCleared
})