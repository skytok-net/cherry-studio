# Research: Secure Network-Enabled TSX Artifacts

**Feature**: 002-secure-network-artifacts
**Research Date**: 2025-01-11
**Status**: Phase 0 Complete

## Executive Summary

Research into implementing secure network access for TSX artifacts in the Cherry Studio Electron application. Focus on zero-configuration user experience while maintaining enterprise-grade security through proxy architecture, domain reputation checking, and intelligent caching.

## Key Technical Decisions

### 1. Network Proxy Architecture

**Decision**: Implement network proxy service in Electron main process with IPC communication to renderer

**Rationale**:
- Electron main process has full Node.js API access for network operations
- Renderer process is sandboxed and cannot make arbitrary network requests
- IPC bridge provides secure communication channel
- Centralizes security validation and logging in main process

**Alternatives Considered**:
- Direct fetch from renderer: Blocked by Electron security model
- External proxy server: Adds deployment complexity and latency
- Service worker approach: Limited in Electron context

### 2. Domain Reputation System

**Decision**: Integration with VirusTotal API v3 and Google Safe Browsing API v4 with local SQLite cache

**Rationale**:
- VirusTotal provides comprehensive threat intelligence from 70+ engines
- Google Safe Browsing has high accuracy and low false positive rate
- Local cache reduces API calls and improves response times
- Fallback mechanism ensures availability if one service fails

**Alternatives Considered**:
- Single service only: Risk of service outages
- Static blocklist: Quickly becomes outdated
- Community lists: Quality and timeliness concerns

### 3. Request Caching Strategy

**Decision**: Multi-tier caching with HTTP header respect and smart TTL defaults

**Rationale**:
- Respects standard HTTP caching headers (Cache-Control, ETag, Last-Modified)
- 15-minute default for dynamic APIs, 1-hour for static content
- Reduces load on external APIs and improves performance
- User can force refresh when needed

**Alternatives Considered**:
- No caching: Poor performance and API abuse
- Fixed TTL: Ignores API provider preferences
- Browser-only caching: Limited control and persistence

### 4. Security Policy Implementation

**Decision**: Multi-layer validation with private network blocking and progressive permissions

**Rationale**:
- OWASP security guidelines for preventing SSRF attacks
- RFC 1918 private network detection (localhost, 192.168.x.x, 10.x.x.x)
- Per-session approval prevents persistent security holes
- Clear user education about risks

**Alternatives Considered**:
- Blanket allow: Security risk
- No override option: Limits legitimate use cases
- Permanent whitelist: Creates persistent attack surface

## Implementation Research

### 1. Electron IPC Patterns

**Best Practice**: Use contextBridge in preload script for secure IPC

```typescript
// preload/networkApi.ts
contextBridge.exposeInMainWorld('networkApi', {
  makeRequest: (request: NetworkRequest) => ipcRenderer.invoke('network:request', request),
  getSettings: () => ipcRenderer.invoke('network:settings')
})
```

**Security**: Prevents renderer from accessing Node.js APIs directly while providing controlled network access.

### 2. HTTP Client Selection

**Decision**: Use node-fetch for consistency with existing Cherry Studio codebase

**Rationale**:
- Already used in main process services
- Full feature support for headers, timeouts, redirects
- Good TypeScript support and error handling

### 3. Rate Limiting Implementation

**Decision**: Token bucket algorithm with per-artifact tracking

**Rationale**:
- Allows bursts up to 10 concurrent requests
- Refills at 100 requests/minute rate
- Prevents abuse while supporting legitimate use patterns

**Implementation**: In-memory tracking with artifact ID as key, persisted across sessions.

### 4. Error Handling Strategy

**Decision**: Structured error responses with actionable user guidance

**Error Types**:
- Network errors: Connection, timeout, DNS resolution
- Security errors: Blocked domains, private networks, malicious content
- Rate limit errors: Too many requests, quota exceeded
- API errors: HTTP status codes, malformed responses

**User Experience**: Each error type includes suggested fixes and retry options.

## External API Integration

### VirusTotal API v3

- **Endpoint**: `https://www.virustotal.com/vtapi/v2/url/report`
- **Rate Limit**: 4 requests/minute (free tier)
- **Response Time**: ~500ms average
- **Cache Strategy**: 24-hour cache for reputation results

### Google Safe Browsing API v4

- **Endpoint**: `https://safebrowsing.googleapis.com/v4/threatMatches:find`
- **Rate Limit**: 10,000 requests/day
- **Response Time**: ~200ms average
- **Cache Strategy**: 1-hour cache for safe domains, 24-hour for threats

## Performance Benchmarks

**Target**: <2s average response time including proxy overhead

**Breakdown**:
- Network proxy processing: <50ms
- Domain reputation check: <500ms (cached) / <800ms (uncached)
- External API request: Variable (API dependent)
- Response caching: <10ms

**Optimization**: Parallel execution of reputation check and API request where possible.

## Security Considerations

### SSRF Prevention

- Validate all URLs against private network ranges
- Block non-HTTP/HTTPS protocols
- Implement maximum redirect limits (5 hops)
- Sanitize and validate all request headers

### Content Validation

- Maximum response size limits (10MB default)
- Content-Type validation for expected formats
- Basic malware scanning for downloaded content
- XSS prevention in artifact rendering

### Logging and Monitoring

- All network requests logged with artifact ID, URL, timestamp
- Security violations logged with detailed context
- Performance metrics tracked for optimization
- User privacy preserved (no request content logged)

## Integration Points

### Existing TSX Artifact System

**Location**: `src/renderer/src/components/CodeBlockView/`

**Integration**: Extend artifact execution context to support network requests through proxy

**Changes Required**:
- Add network API to artifact sandbox
- Update artifact preview to handle async data loading
- Implement loading states and error boundaries

### Redux State Management

**New Slice**: `networkSlice.ts` for request tracking and settings

**State Shape**:
```typescript
{
  requests: Record<string, NetworkRequestState>,
  settings: NetworkSettings,
  reputation: Record<string, DomainReputation>
}
```

## Risk Mitigation

### High-Risk Areas

1. **SSRF Attacks**: Mitigated by comprehensive URL validation
2. **API Key Exposure**: Stored securely in main process, never sent to renderer
3. **Rate Limit Abuse**: Token bucket algorithm with strict enforcement
4. **Memory Leaks**: Automatic cleanup of old cache entries and request tracking

### Monitoring Strategy

- Request success/failure rates by domain
- Response time percentiles
- Cache hit rates
- Security violation frequency

## Next Steps

1. **Phase 1**: Implement data model and API contracts
2. **Implementation**: Begin with network proxy service in main process
3. **Testing**: Comprehensive security testing with known attack vectors
4. **Documentation**: User guide for network-enabled artifacts

---

**Research Complete**: All technical unknowns resolved, ready for Phase 1 design.