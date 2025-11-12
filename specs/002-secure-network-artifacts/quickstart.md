# Quickstart: Secure Network-Enabled TSX Artifacts

**Feature**: 002-secure-network-artifacts
**Quickstart Date**: 2025-01-11
**Audience**: Developers implementing network functionality in TSX artifacts

## Overview

This quickstart guide helps developers implement secure network requests in TSX artifacts within Cherry Studio. The system provides zero-configuration network access while maintaining enterprise-grade security through automatic proxy handling, domain reputation checking, and intelligent caching.

## Prerequisites

- Cherry Studio development environment set up
- Basic understanding of TypeScript and React
- Familiarity with Electron IPC patterns

## 5-Minute Setup

### 1. Create a Network-Enabled TSX Artifact

```tsx
// Example: Weather Widget Artifact
import React, { useState, useEffect } from 'react'

interface WeatherData {
  temperature: number
  condition: string
  location: string
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWeatherData()
  }, [])

  const fetchWeatherData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Network request through Cherry Studio's secure proxy
      const response = await window.networkApi.makeRequest({
        id: crypto.randomUUID(),
        artifactId: 'weather-widget-001',
        url: 'https://api.openweathermap.org/data/2.5/weather?q=London&appid=demo',
        method: 'GET'
      })

      const data = JSON.parse(response.body)
      setWeather({
        temperature: Math.round(data.main.temp - 273.15), // Convert from Kelvin
        condition: data.weather[0].description,
        location: data.name
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch weather data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading weather data...</div>
  if (error) return <div>Error: {error}</div>
  if (!weather) return <div>No weather data available</div>

  return (
    <div className="weather-widget">
      <h3>Weather in {weather.location}</h3>
      <p>Temperature: {weather.temperature}°C</p>
      <p>Condition: {weather.condition}</p>
      <button onClick={fetchWeatherData}>Refresh</button>
    </div>
  )
}
```

### 2. Handle Different Request Types

```tsx
// POST request example
const postData = async (data: any) => {
  try {
    const response = await window.networkApi.makeRequest({
      id: crypto.randomUUID(),
      artifactId: 'data-poster-001',
      url: 'https://api.example.com/data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })

    return JSON.parse(response.body)
  } catch (error) {
    console.error('POST request failed:', error)
    throw error
  }
}

// GET with custom headers
const fetchWithAuth = async (token: string) => {
  return await window.networkApi.makeRequest({
    id: crypto.randomUUID(),
    artifactId: 'auth-client-001',
    url: 'https://api.secure-service.com/profile',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  })
}
```

### 3. Error Handling Best Practices

```tsx
import React from 'react'
import { NetworkError, SecurityViolation } from '../contracts/network-api'

function useNetworkRequest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const makeRequest = async (request: NetworkRequest) => {
    try {
      setLoading(true)
      setError(null)

      return await window.networkApi.makeRequest(request)
    } catch (err) {
      // Handle different error types
      if (isNetworkError(err)) {
        switch (err.type) {
          case 'security':
            setError(`Security block: ${err.message}. ${err.suggestedFix || ''}`)
            break
          case 'rate_limit':
            setError('Too many requests. Please wait and try again.')
            break
          case 'timeout':
            setError('Request timed out. Please check your connection.')
            break
          default:
            setError(`Network error: ${err.message}`)
        }
      } else {
        setError('An unexpected error occurred')
      }
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { makeRequest, loading, error }
}

function isNetworkError(error: any): error is NetworkError {
  return error && typeof error === 'object' && 'type' in error
}
```

## Common Patterns

### 1. Data Fetching Hook

```tsx
function useApiData<T>(url: string, artifactId: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        const response = await window.networkApi.makeRequest({
          id: crypto.randomUUID(),
          artifactId,
          url,
          method: 'GET'
        })

        if (mounted) {
          setData(JSON.parse(response.body))
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, [url, artifactId])

  return { data, loading, error }
}
```

### 2. Caching and Refresh

```tsx
function useApiWithCache<T>(url: string, artifactId: string, cacheDuration = 300000) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  const fetchData = async (forceRefresh = false) => {
    if (forceRefresh) {
      // Clear cache for this domain
      const domain = new URL(url).hostname
      await window.networkApi.clearCache(domain)
    }

    const response = await window.networkApi.makeRequest({
      id: crypto.randomUUID(),
      artifactId,
      url,
      method: 'GET'
    })

    setData(JSON.parse(response.body))
    setFromCache(response.fromCache)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [url, artifactId])

  return {
    data,
    loading,
    fromCache,
    refresh: () => fetchData(true)
  }
}
```

### 3. Batch Requests

```tsx
async function fetchMultipleEndpoints(endpoints: string[], artifactId: string) {
  const requests = endpoints.map(url => ({
    id: crypto.randomUUID(),
    artifactId,
    url,
    method: 'GET' as const
  }))

  // Execute all requests in parallel
  const responses = await Promise.allSettled(
    requests.map(req => window.networkApi.makeRequest(req))
  )

  return responses.map((result, index) => ({
    url: endpoints[index],
    success: result.status === 'fulfilled',
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null
  }))
}
```

## Security Considerations

### 1. Domain Reputation Check

```tsx
// Check domain reputation before making requests
async function checkDomainSafety(url: string) {
  try {
    const domain = new URL(url).hostname
    const reputation = await window.networkApi.checkDomain(domain)

    if (reputation.level === 'blocked') {
      throw new Error(`Domain ${domain} is blocked due to security concerns`)
    }

    if (reputation.level === 'suspicious') {
      console.warn(`Domain ${domain} has suspicious reputation`)
    }

    return reputation
  } catch (error) {
    console.error('Failed to check domain reputation:', error)
    throw error
  }
}
```

### 2. Private Network Handling

```tsx
// Handle private network access with user consent
async function requestWithPrivateNetworkSupport(url: string, artifactId: string) {
  try {
    return await window.networkApi.makeRequest({
      id: crypto.randomUUID(),
      artifactId,
      url,
      method: 'GET'
    })
  } catch (error) {
    if (error.type === 'security' && error.details?.violationType === 'private_network') {
      // Show user confirmation dialog
      const userConsent = confirm(
        `This artifact wants to access a private network address (${url}). ` +
        `This could be a security risk. Do you want to allow this?`
      )

      if (userConsent) {
        const domain = new URL(url).hostname
        await window.networkApi.overrideBlock(domain, 'User approved private network access')

        // Retry the request
        return await window.networkApi.makeRequest({
          id: crypto.randomUUID(),
          artifactId,
          url,
          method: 'GET'
        })
      }
    }
    throw error
  }
}
```

## Performance Tips

### 1. Request Deduplication

```tsx
const requestCache = new Map<string, Promise<NetworkResponse>>()

function deduplicatedRequest(request: NetworkRequest): Promise<NetworkResponse> {
  const key = `${request.method}:${request.url}`

  if (requestCache.has(key)) {
    return requestCache.get(key)!
  }

  const promise = window.networkApi.makeRequest(request)
    .finally(() => {
      // Clean up cache after request completes
      setTimeout(() => requestCache.delete(key), 1000)
    })

  requestCache.set(key, promise)
  return promise
}
```

### 2. Request Prioritization

```tsx
// High priority requests (user-initiated)
const highPriorityRequest = async (url: string) => {
  return window.networkApi.makeRequest({
    id: crypto.randomUUID(),
    artifactId: 'user-action-001',
    url,
    method: 'GET',
    timeout: 5000 // Shorter timeout for user actions
  })
}

// Background requests (automatic updates)
const backgroundRequest = async (url: string) => {
  return window.networkApi.makeRequest({
    id: crypto.randomUUID(),
    artifactId: 'background-sync-001',
    url,
    method: 'GET',
    timeout: 30000 // Longer timeout for background requests
  })
}
```

## Debugging

### 1. Network Statistics

```tsx
// Get network statistics for debugging
async function logNetworkStats() {
  const stats = await window.networkApi.getStats()
  console.log('Network Statistics:', {
    totalRequests: stats.totalRequests,
    successRate: (stats.successfulRequests / stats.totalRequests * 100).toFixed(2) + '%',
    cacheHitRate: (stats.cacheHitRate * 100).toFixed(2) + '%',
    averageResponseTime: stats.averageResponseTime + 'ms',
    rateLimitRemaining: stats.rateLimitRemaining
  })
}
```

### 2. Request Logging

```tsx
// Enhanced request with logging
async function loggedRequest(request: NetworkRequest) {
  console.log('Making request:', {
    url: request.url,
    method: request.method,
    timestamp: new Date().toISOString()
  })

  try {
    const response = await window.networkApi.makeRequest(request)
    console.log('Request successful:', {
      url: request.url,
      status: response.status,
      fromCache: response.fromCache,
      responseTime: response.responseTime
    })
    return response
  } catch (error) {
    console.error('Request failed:', {
      url: request.url,
      error: error.message,
      type: error.type
    })
    throw error
  }
}
```

## Next Steps

1. **Implement Your First Artifact**: Start with a simple GET request to a public API
2. **Add Error Handling**: Implement comprehensive error handling for production use
3. **Test Security Features**: Try accessing private networks to see security prompts
4. **Optimize Performance**: Use caching and request deduplication for better UX
5. **Monitor Usage**: Use network statistics to optimize your artifact's behavior

## Need Help?

- Check the [data model documentation](./data-model.md) for detailed entity definitions
- Review [API contracts](./contracts/) for complete interface specifications
- See existing implementations in `src/renderer/src/components/CodeBlockView/`

---

**Ready to Build**: You now have everything needed to create secure, network-enabled TSX artifacts!