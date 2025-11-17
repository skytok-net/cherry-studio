# Research: Transpiler Service Rearchitecture

**Date**: 2025-11-17
**Status**: Phase 0 Research Complete

## Research Topics & Decisions

### 1. IPC Mechanism for Native esbuild Communication

**Decision**: Use Node.js `child_process.spawn()` with proper binary path resolution

**Rationale**:
- Direct process spawning provides the best performance for native binary execution
- Allows proper stdio redirection for error handling and debugging
- Well-documented pattern in Electron applications
- Avoids the complexity of worker threads while maintaining process isolation

**Alternatives considered**:
- Worker threads: Added complexity without significant benefit for binary execution
- Direct esbuild Node.js API calls: Already attempted, causes "spawn ENOTDIR" in packaged builds
- IPC channels: Unnecessary overhead for simple binary execution

**Implementation approach**: Spawn esbuild binary with stdin/stdout communication, capture stderr for error reporting

### 2. macOS Sandbox Entitlements for Binary Execution

**Decision**: Use `com.apple.security.cs.allow-unsigned-executable-memory` and `com.apple.security.cs.disable-library-validation` entitlements

**Rationale**:
- Required for executing dynamically downloaded or packaged native binaries
- Standard practice for development tools and code editors in Mac App Store
- Enables proper esbuild native binary execution without sandbox violations
- Documented in Electron security best practices

**Alternatives considered**:
- Code signing all binaries: Complex distribution and platform maintenance
- Sandbox exemption: Too broad, security concerns
- WebAssembly-only approach: 10x performance penalty unacceptable

**Implementation approach**: Update electron-builder.yml with proper entitlements, ensure binaries are properly signed during packaging

### 3. WebAssembly Execution Context in Electron

**Decision**: Execute esbuild-wasm in Electron main process

**Rationale**:
- Research confirms main process provides better performance than renderer process
- Direct file system access without IPC overhead
- Consistent with current architecture patterns
- Avoids context switching between main/renderer for transpilation operations

**Alternatives considered**:
- Renderer process execution: Performance degradation due to IPC overhead
- Worker thread execution: Added complexity without clear benefits
- Separate WebAssembly service: Over-engineering for the use case

**Implementation approach**: Initialize esbuild-wasm with empty configuration object to auto-detect Node.js environment

### 4. File Size Constraint Strategy (500-line limit)

**Decision**: Implement single-responsibility services with clear interface boundaries

**Rationale**:
- Forces good separation of concerns and maintainability
- Each service has a focused purpose (binary detection, transpilation, caching, etc.)
- Easier testing and debugging with smaller, focused modules
- Aligns with SOLID principles and clean architecture

**Alternatives considered**:
- Monolithic service: Violates the 500-line constraint
- Over-segmentation: Could lead to unnecessary complexity and coupling
- Exception for main service: Would undermine the architectural principle

**Implementation approach**:
- ITranspilationService.ts: Interface definition only (~50 lines)
- TranspilationServiceImpl.ts: Main coordinator (~400 lines)
- BinaryProvider.ts: Binary detection and management (~300 lines)
- FallbackChain.ts: Execution mode orchestration (~200 lines)
- Provider implementations: ~250 lines each

### 5. Transpilation Result Caching Strategy

**Decision**: Implement in-memory LRU cache with content hash keys

**Rationale**:
- Significant performance improvement for repeated transpilations
- Content-based hashing ensures cache validity across code changes
- Memory-efficient with automatic eviction of old results
- Faster than disk-based caching for typical artifact sizes

**Alternatives considered**:
- Disk-based caching: Slower access, complexity with file cleanup
- No caching: Missed performance optimization opportunity
- Database caching: Over-engineering for simple key-value storage

**Implementation approach**: Use content SHA-256 hash as cache key, store TranspilationResult objects with metadata

### 6. Framework Plugin Architecture

**Decision**: Implement pluggable framework handlers with standardized interface

**Rationale**:
- Clean separation between framework-specific logic and core transpilation
- Enables easy addition of new frameworks without modifying core services
- Each handler encapsulates framework-specific esbuild configuration
- Consistent error handling and result formatting across frameworks

**Alternatives considered**:
- Monolithic framework handling: Would violate single responsibility principle
- Dynamic plugin loading: Unnecessary complexity for known frameworks
- External plugin system: Over-engineering for internal framework support

**Implementation approach**:
- Base FrameworkHandler interface with transpile() method
- ReactHandler, VueHandler, SvelteHandler, SolidHandler implementations
- Factory pattern for handler instantiation based on framework type

### 7. Error Handling and Debugging Strategy

**Decision**: Implement structured error reporting with context preservation

**Rationale**:
- Critical for debugging transpilation failures in production
- Maintains error context through the fallback chain
- Provides actionable feedback to users and developers
- Enables performance monitoring and optimization

**Alternatives considered**:
- Simple error propagation: Loses valuable context for debugging
- Error transformation: Could mask original error causes
- Silent failure handling: Unacceptable for development tool

**Implementation approach**:
- Custom TranspilationError type with location information
- Error context preservation through fallback chain
- Structured logging with correlation IDs for request tracking

### 8. Performance Monitoring and Benchmarking

**Decision**: Implement performance metrics collection with timing and memory tracking

**Rationale**:
- Essential for validating success criteria (<100ms React, <500ms WebAssembly)
- Enables performance regression detection during development
- Provides data for optimization decisions
- Supports user feedback about transpilation performance

**Alternatives considered**:
- No performance monitoring: Unable to validate success criteria
- External monitoring only: Misses internal execution details
- Manual timing: Inconsistent and error-prone

**Implementation approach**:
- Built-in timing measurement for each transpilation phase
- Memory usage tracking during WebAssembly initialization
- Performance metrics exposed through service interface
- Integration with existing logging infrastructure

## Implementation Dependencies

- **esbuild**: Native binary transpilation (primary)
- **esbuild-wasm**: WebAssembly fallback
- **@babel/core**: Fallback transpiler
- **Framework plugins**: esbuild-plugin-react18, esbuild-plugin-vue3, esbuild-svelte, esbuild-plugin-solid
- **Node.js APIs**: child_process, fs/promises, crypto (for content hashing)

## Risk Mitigation

- **Binary execution failures**: Multi-tier fallback chain ensures functionality
- **Performance degradation**: Monitoring and alerting for performance regression
- **Framework compatibility**: Comprehensive test suite with real-world examples
- **Memory leaks**: Proper cleanup and resource management in all providers
- **Security concerns**: Proper input validation and sandbox compliance

## Next Steps

All research topics have been resolved with clear technical decisions. Ready to proceed to Phase 1: Design & Contracts.