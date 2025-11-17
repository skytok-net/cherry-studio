# New Transpiler Service Integration

This document outlines the integration of the new three-tier transpilation service with the existing artifact system.

## Overview

The new transpilation service provides a robust three-tier fallback system:
1. **Native esbuild** (fastest, requires binary)
2. **WebAssembly esbuild** (fast, reliable fallback)
3. **Babel** (slowest, universal compatibility)

## Backward Compatibility

The integration maintains **100% backward compatibility** with the existing artifact system:

- ✅ Same IPC channel (`transpile-artifact`)
- ✅ Same request/response format
- ✅ Same error handling patterns
- ✅ Same retry mechanism integration

## Files Changed

### New Files Created
- `src/main/services/transpilation/ArtifactTranspilerAdapter.ts` - Bridges new service with legacy interface
- `src/main/services/transpilation/LegacyArtifactTranspilerService.ts` - Drop-in replacement
- `tests/integration/transpilation-integration.test.ts` - Integration tests

### Files Modified
- `src/main/ipc.ts` - Updated imports to use new service (lines 37-38)

## Key Benefits

### 1. Enhanced Reliability
- Three-tier fallback ensures transpilation always succeeds when possible
- Structured error handling with actionable suggestions
- Automatic provider health monitoring

### 2. Better Performance
- Native esbuild when available (100ms target)
- WebAssembly fallback (500ms target)
- Intelligent caching with framework-aware keys

### 3. Improved Error Reporting
- Structured error codes for different failure scenarios
- Context-aware error messages with recovery suggestions
- Detailed error metrics for monitoring

### 4. Framework Extensibility
- Modular framework handler system
- Easy to add support for Vue, Svelte, Solid
- Preprocessing and postprocessing pipelines

## Usage (No Changes Required)

The service is a drop-in replacement. Existing code continues to work:

```typescript
// This remains unchanged
const result = await artifactTranspilerService.transpile({
  code: 'function Component() { return <div>Hello</div>; }',
  framework: 'react',
  language: 'javascript',
  filename: 'Component.jsx'
});
```

## Monitoring and Debugging

### Health Check
```typescript
const isHealthy = artifactTranspilerService.isHealthy();
```

### Service Status
```typescript
const status = artifactTranspilerService.getStatus();
console.log('Service metrics:', status.metrics);
console.log('Active providers:', status.activeProviders);
```

### Error Tracking
The new service provides detailed error metrics and recovery strategies that can be accessed through the status endpoint.

## Migration Path

### Phase 1: ✅ Integration Complete
- New service integrated with legacy interface
- All existing functionality preserved
- Enhanced error handling and performance

### Phase 2: Framework Expansion (Future)
- Add Vue.js support (T025)
- Add Svelte support (T026)
- Add Solid.js support (T027)

### Phase 3: Advanced Features (Future)
- Real-time performance monitoring
- Custom transpilation plugins
- Advanced caching strategies

## Testing

Run integration tests to verify functionality:

```bash
yarn test tests/integration/transpilation-integration.test.ts
```

## Rollback Plan

If issues arise, rollback is simple - revert the import changes in `src/main/ipc.ts`:

```typescript
// Rollback to:
import { artifactTranspilerService } from './services/ArtifactTranspilerService'
```

## Performance Expectations

| Provider | Target Time | Typical Use Case |
|----------|-------------|------------------|
| Native   | <100ms      | Development, small files |
| WASM     | <500ms      | Production, medium files |
| Babel    | <2000ms     | Complex transforms, large files |

## Error Codes

The new system provides structured error codes:

- `NATIVE_BINARY_NOT_FOUND` - esbuild binary missing
- `WASM_MEMORY_LIMIT_EXCEEDED` - File too large for WASM
- `BABEL_PARSING_ERROR` - Syntax error in code
- `FRAMEWORK_NOT_SUPPORTED` - Unsupported framework
- And many more...

Each error includes contextual suggestions for resolution.

## Support

For questions or issues with the new transpilation service:

1. Check service health: `artifactTranspilerService.getStatus()`
2. Review error logs for structured error codes
3. Run integration tests to verify setup
4. Check this documentation for common patterns