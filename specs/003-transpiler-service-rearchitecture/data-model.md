# Data Model: Transpiler Service Rearchitecture

**Date**: 2025-11-17
**Status**: Phase 1 Design Complete

## Core Entities

### TranspilationRequest

Represents user code requiring compilation, including source code, target framework, language type, and compilation options.

**Fields**:
- `code: string` - Source code to transpile
- `framework: ArtifactFramework` - Target framework ('react' | 'vue' | 'svelte' | 'solid' | 'preact')
- `language: 'typescript' | 'javascript'` - Source language type
- `filename?: string` - Optional filename for error reporting
- `options?: TranspilationOptions` - Compilation options

**Validation Rules**:
- `code` must be non-empty string
- `framework` must be one of supported frameworks
- `language` must be 'typescript' or 'javascript'
- `filename` if provided must be valid filename
- Total code length should not exceed reasonable limits (e.g., 1MB)

**Relationships**:
- Input to TranspilationService.transpile()
- Processed by FrameworkHandler implementations

### TranspilationResult

Contains compiled code, source maps, warnings, timing metrics, and execution mode used.

**Fields**:
- `code: string` - Transpiled JavaScript code
- `map?: string` - Source map for debugging
- `warnings?: Message[]` - Compilation warnings from esbuild
- `executionMode: 'native' | 'webassembly' | 'babel'` - Which transpiler was used
- `duration: number` - Transpilation time in milliseconds
- `memoryUsage?: number` - Peak memory usage during transpilation
- `cacheHit: boolean` - Whether result came from cache

**Validation Rules**:
- `code` must be valid JavaScript
- `duration` must be positive number
- `executionMode` must be one of the three supported modes
- `memoryUsage` if present must be positive

**Relationships**:
- Output from TranspilationService.transpile()
- Stored in TranspilationCache
- Returned to calling code

### TranspilationService

Core abstraction providing compilation capabilities with fallback chain management.

**Fields**:
- `isInitialized: boolean` - Service initialization status
- `currentProvider: TranspilationProvider` - Active transpilation provider
- `fallbackChain: FallbackChain` - Fallback orchestration
- `cache: TranspilationCache` - Result caching service

**Methods**:
- `initialize(): Promise<void>` - Initialize service and detect capabilities
- `transpile(request: TranspilationRequest): Promise<TranspilationResult>` - Main transpilation method
- `getCapabilities(): ServiceCapabilities` - Query supported features
- `dispose(): Promise<void>` - Cleanup resources

**State Transitions**:
- `uninitialized` → `initializing` → `ready`
- `ready` → `error` (on critical failure)
- `error` → `ready` (on recovery/reinitialize)

### BinaryProvider

Manages native esbuild binary detection, permissions, and platform-specific distribution.

**Fields**:
- `platform: NodeJS.Platform` - Target platform
- `architecture: string` - Target architecture
- `binaryPath?: string` - Path to native binary if available
- `isAvailable: boolean` - Whether native binary is usable
- `permissions: BinaryPermissions` - Executable permission status

**Methods**:
- `detectBinary(): Promise<string | null>` - Find platform-appropriate binary
- `validatePermissions(path: string): Promise<boolean>` - Check executable permissions
- `ensureExecutable(path: string): Promise<boolean>` - Set executable permissions
- `downloadFallback(): Promise<string>` - Download binary if missing

**Validation Rules**:
- `binaryPath` if set must be valid file system path
- `platform` must be supported platform
- `architecture` must be supported architecture

### FrameworkHandler

Handles framework-specific compilation logic (React, Vue, Svelte, Solid.js).

**Fields**:
- `framework: ArtifactFramework` - Framework this handler supports
- `plugins: EsbuildPlugin[]` - Framework-specific esbuild plugins
- `config: FrameworkConfig` - Framework-specific configuration

**Methods**:
- `canHandle(framework: ArtifactFramework): boolean` - Check if handler supports framework
- `configure(options: TranspilationOptions): EsbuildConfig` - Generate esbuild configuration
- `preprocess(code: string): string` - Framework-specific code preprocessing
- `postprocess(result: EsbuildResult): TranspilationResult` - Process esbuild output

**Specializations**:
- `ReactHandler` - React/Preact transpilation with JSX
- `VueHandler` - Vue SFC compilation
- `SvelteHandler` - Svelte component compilation
- `SolidHandler` - Solid.js JSX compilation

### FallbackChain

Orchestrates execution mode selection and graceful degradation between native, WebAssembly, and Babel.

**Fields**:
- `providers: TranspilationProvider[]` - Ordered list of providers
- `currentIndex: number` - Active provider index
- `failureReasons: Map<string, Error>` - Why each provider failed

**Methods**:
- `initialize(): Promise<void>` - Set up provider chain
- `getNextProvider(): TranspilationProvider | null` - Get next fallback option
- `recordFailure(provider: string, error: Error): void` - Track provider failure
- `reset(): void` - Reset to primary provider

**State Transitions**:
- Always attempts providers in order: Native → WebAssembly → Babel
- Moves to next provider on failure
- Resets to primary on success or manual reset

### TranspilationCache

**Fields**:
- `storage: Map<string, CachedResult>` - In-memory cache storage
- `maxSize: number` - Maximum cache entries
- `hitCount: number` - Cache hit statistics
- `missCount: number` - Cache miss statistics

**Methods**:
- `get(key: string): TranspilationResult | null` - Retrieve cached result
- `set(key: string, result: TranspilationResult): void` - Store result
- `generateKey(request: TranspilationRequest): string` - Create cache key from request
- `clear(): void` - Clear all cached results
- `getStats(): CacheStatistics` - Get cache performance metrics

**Cache Key Strategy**:
- Content-based hashing using SHA-256 of: code + framework + language + options
- Ensures invalidation when any aspect of transpilation changes
- Collision-resistant and deterministic

## Value Objects

### TranspilationOptions

```typescript
interface TranspilationOptions {
  sourcemap?: 'inline' | 'external' | 'none';
  target?: string; // e.g., 'es2020'
  minify?: boolean;
  platform?: 'browser' | 'node';
  jsx?: 'preserve' | 'transform';
}
```

### ServiceCapabilities

```typescript
interface ServiceCapabilities {
  nativeEsbuild: boolean;
  webAssembly: boolean;
  babelFallback: boolean;
  supportedFrameworks: ArtifactFramework[];
  platformSupport: PlatformInfo;
}
```

### TranspilationError

```typescript
interface TranspilationError extends Error {
  code: string;
  location?: {
    file: string;
    line: number;
    column: number;
    lineText: string;
    suggestion?: string;
  };
  executionMode: 'native' | 'webassembly' | 'babel';
  originalError?: Error;
}
```

## Data Flow

1. **Request Creation**: User code → TranspilationRequest
2. **Cache Check**: Request → Cache key generation → Cache lookup
3. **Provider Selection**: FallbackChain determines active provider
4. **Framework Routing**: Framework type → Appropriate FrameworkHandler
5. **Transpilation**: Handler + Provider → TranspilationResult
6. **Cache Storage**: Result → Cache storage with generated key
7. **Response**: TranspilationResult → Calling code

## Persistence

- **Cache**: In-memory only, cleared on application restart
- **Binary Detection**: Results cached in memory during session
- **Configuration**: No persistent configuration required
- **Metrics**: Logged but not persisted (integration with existing logging)

## Performance Considerations

- **Cache Size**: LRU eviction when maxSize exceeded
- **Memory Usage**: Monitor WebAssembly initialization memory
- **Concurrency**: Support 50 concurrent transpilations
- **Timeout Handling**: Each provider has configurable timeout (2s default)

## Security Considerations

- **Input Validation**: Code size limits, filename sanitization
- **Binary Execution**: Validated paths, permission checks
- **Sandbox Compliance**: Proper entitlements for macOS
- **Error Information**: Sanitize error messages to prevent information leakage