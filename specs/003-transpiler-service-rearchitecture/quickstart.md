# Quick Start: Transpiler Service Rearchitecture

**Feature**: 003-transpiler-service-rearchitecture
**Date**: 2025-11-17
**Status**: Phase 1 Design Complete

## Overview

This quick start guide provides developers with essential information to understand and work with the rearchitected transpiler service. The new design implements a robust ITranspilationService interface with graceful fallback between native esbuild binaries, WebAssembly, and Babel transpilation.

## Architecture Summary

### Core Components

```text
┌─────────────────────────────────────────────────────────────┐
│                    ITranspilationService                   │
│                   (Main Coordinator)                       │
└─────┬───────────────────────────────────┬───────────────────┘
      │                                   │
┌─────▼────────┐                    ┌────▼──────────────────┐
│ FallbackChain│                    │   FrameworkHandlers   │
│ Orchestrator │                    │ (React/Vue/Svelte)    │
└─────┬────────┘                    └───────────────────────┘
      │
┌─────▼─────────────────────────────────────────────────────┐
│              TranspilationProviders                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐  │
│  │   Native    │ │ WebAssembly │ │      Babel          │  │
│  │   esbuild   │ │   esbuild   │ │    Fallback         │  │
│  │    (IPC)    │ │   (WASM)    │ │  (JavaScript)       │  │
│  └─────────────┘ └─────────────┘ └─────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### Key Features

- **Multi-tier Fallback**: Native → WebAssembly → Babel
- **Framework Support**: React (P1), Vue, Svelte, Solid.js
- **Cross-Platform**: macOS/Windows/Linux on Intel/ARM
- **Performance Optimized**: <100ms React, <500ms WebAssembly
- **Sandbox Compliant**: macOS security entitlements included

## Core Interfaces

### ITranspilationService

Main entry point for all transpilation operations:

```typescript
interface ITranspilationService {
  initialize(): Promise<void>;
  transpile(request: TranspilationRequest): Promise<TranspilationResult>;
  getCapabilities(): ServiceCapabilities;
  dispose(): Promise<void>;
}
```

### Basic Usage Example

```typescript
import { ITranspilationService } from './contracts';

// Initialize service
const transpiler = new TranspilationServiceImpl();
await transpiler.initialize();

// Transpile React component
const result = await transpiler.transpile({
  code: `
    import React from 'react';
    export default function Hello() {
      return <div>Hello World!</div>;
    }
  `,
  framework: 'react',
  language: 'typescript',
  filename: 'Hello.tsx'
});

console.log(`Transpiled in ${result.duration}ms using ${result.executionMode}`);
console.log(result.code); // Transpiled JavaScript
```

## Service Architecture

### File Structure (Under 500 Lines Each)

```text
src/main/services/transpilation/
├── ITranspilationService.ts        # Core interface (~50 lines)
├── TranspilationServiceImpl.ts     # Main coordinator (~400 lines)
├── BinaryProvider.ts               # Native binary management (~300 lines)
├── FallbackChain.ts               # Execution orchestration (~200 lines)
└── FrameworkHandlers.ts           # Framework logic (~250 lines each)

src/main/services/providers/
├── NativeEsbuildProvider.ts       # Native binary via IPC (~250 lines)
├── WebAssemblyProvider.ts         # esbuild-wasm implementation (~250 lines)
└── BabelProvider.ts               # Babel fallback (~250 lines)

src/main/services/cache/
└── TranspilationCache.ts          # Result caching (~200 lines)
```

### Execution Modes

1. **Native esbuild** (Primary)
   - Fastest performance (<100ms for React)
   - Uses native binaries via IPC
   - Platform-specific binary detection

2. **WebAssembly esbuild** (Fallback)
   - Good performance (<500ms)
   - Cross-platform compatibility
   - No binary dependencies

3. **Babel** (Final Fallback)
   - Guaranteed compatibility
   - Slower but reliable (<2s)
   - JavaScript-based transpilation

## Framework Support

### React (Priority 1)
```typescript
const reactResult = await transpiler.transpile({
  code: 'const App = () => <div>React</div>;',
  framework: 'react',
  language: 'typescript'
});
```

### Vue Single File Components
```typescript
const vueResult = await transpiler.transpile({
  code: '<template><div>Vue</div></template><script>export default {}</script>',
  framework: 'vue',
  language: 'javascript'
});
```

### Svelte Components
```typescript
const svelteResult = await transpiler.transpile({
  code: '<script>let name = "Svelte";</script><h1>Hello {name}!</h1>',
  framework: 'svelte',
  language: 'javascript'
});
```

## Performance Characteristics

| Execution Mode | Expected Time | Use Case |
|----------------|---------------|----------|
| Native esbuild | <100ms | Production, optimal performance |
| WebAssembly | <500ms | Fallback when native unavailable |
| Babel | <2000ms | Final fallback, guaranteed compatibility |

## Configuration

### Service Initialization
```typescript
const service = new TranspilationServiceImpl();
await service.initialize(); // Auto-detects capabilities

const capabilities = service.getCapabilities();
console.log('Available modes:', capabilities.nativeEsbuild, capabilities.webAssembly);
```

### Transpilation Options
```typescript
const result = await transpiler.transpile({
  code: sourceCode,
  framework: 'react',
  language: 'typescript',
  options: {
    sourcemap: 'inline',
    minify: false,
    target: 'es2020',
    platform: 'browser'
  }
});
```

## Error Handling

The service provides structured error information:

```typescript
try {
  const result = await transpiler.transpile(request);
} catch (error) {
  if (error instanceof TranspilationError) {
    console.log('Error code:', error.code);
    console.log('Execution mode:', error.executionMode);
    console.log('Location:', error.location);
    console.log('Suggestion:', error.suggestion);
  }
}
```

## Caching

Automatic result caching based on content hashing:

```typescript
// First transpilation - computed
const result1 = await transpiler.transpile(request);
console.log('Cache hit:', result1.cacheHit); // false

// Same code - cached result
const result2 = await transpiler.transpile(request);
console.log('Cache hit:', result2.cacheHit); // true
```

## Platform Considerations

### macOS Sandbox Compliance
- Proper entitlements in electron-builder.yml
- Binary execution permissions validated
- Sandbox-compliant file system access

### Cross-Platform Binary Distribution
- Platform-specific esbuild binaries bundled
- Automatic architecture detection
- Fallback download mechanism

### Windows/Linux Support
- Native binaries for x64 and ARM architectures
- Proper executable permissions handling
- Platform-specific path resolution

## Monitoring and Debugging

### Service Status
```typescript
const status = transpiler.getStatus();
console.log('Service state:', status.state);
console.log('Success rate:', status.health.successRate);
console.log('Average duration:', status.health.averageDuration);
```

### Performance Metrics
```typescript
const result = await transpiler.transpile(request);
console.log('Duration:', result.duration);
console.log('Memory usage:', result.memoryUsage);
console.log('Execution mode:', result.executionMode);
```

## Testing Strategy

### Unit Tests
- Each service component under 500 lines
- Interface contract validation
- Error handling scenarios
- Performance benchmarking

### Integration Tests
- End-to-end transpilation flows
- Fallback chain behavior
- Cross-platform compatibility
- Framework-specific scenarios

### Performance Tests
- React transpilation <100ms
- WebAssembly fallback <500ms
- Concurrent request handling
- Memory usage validation

## Development Workflows

### Adding New Framework Support
1. Implement IFrameworkHandler interface
2. Add framework-specific esbuild plugins
3. Update framework registry
4. Add test fixtures and validation

### Provider Customization
1. Implement ITranspilationProvider interface
2. Register with FallbackChain
3. Configure priority and capabilities
4. Add provider-specific error handling

### Performance Optimization
1. Monitor transpilation metrics
2. Analyze fallback chain usage
3. Optimize cache hit rates
4. Profile memory usage patterns

## Next Steps

This design documentation provides the foundation for Phase 2 implementation. The next step is to run `/speckit.tasks` to generate the detailed implementation task list based on these contracts and design decisions.

Key implementation priorities:
1. ITranspilationService core interface
2. Native esbuild provider with IPC
3. React framework handler (P1)
4. Fallback chain orchestration
5. Cross-platform binary distribution
6. macOS sandbox compliance validation