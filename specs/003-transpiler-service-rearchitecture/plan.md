# Implementation Plan: Transpiler Service Rearchitecture

**Branch**: `003-transpiler-service-rearchitecture` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-transpiler-service-rearchitecture/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Complete rearchitecture of the artifact transpiler service to resolve critical "spawn ENOTDIR" errors in packaged builds and improve performance. The new design implements an ITranspilationService interface abstraction with graceful fallback between native esbuild binaries (via IPC), esbuild-wasm, and Babel transpilation. Key goals include ensuring no code files exceed 500 lines, proper cross-platform binary distribution, macOS sandbox compliance, and React.js as P1 priority with Vue/Svelte/Solid.js support.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript/Node.js (Electron main process), React frontend (renderer process)
**Primary Dependencies**: esbuild, esbuild-wasm, babel, electron, react plugins (react18, vue3, svelte, solid)
**Storage**: File system cache for transpilation results, in-memory binary detection cache
**Testing**: Vitest for unit tests, integration tests for transpilation accuracy and performance
**Target Platform**: Cross-platform Electron (macOS Intel/ARM, Windows x64/ARM, Linux x64/ARM)
**Project Type**: Electron desktop application with main/renderer architecture
**Performance Goals**: <100ms React transpilation (native), <500ms WebAssembly fallback, <2s Babel fallback
**Constraints**: 500-line file limit, <100MB memory usage, macOS sandbox compliance, zero "spawn ENOTDIR" errors
**Scale/Scope**: Handle 50 concurrent transpilations, 99.9% success rate, 4 framework support (React/Vue/Svelte/Solid)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**STATUS**: Constitution file (.specify/memory/constitution.md) is currently a template and has not been configured for this project. No constitutional gates currently defined.

**DESIGN DECISIONS TO VALIDATE**:
- Modular architecture with 500-line file limit aligns with maintainability principles
- Interface abstraction (ITranspilationService) follows separation of concerns
- Graceful fallback chain ensures system reliability
- Test-driven approach with performance benchmarks supports quality gates

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# Electron Application Structure (Main + Renderer)
src/main/services/
├── transpilation/
│   ├── ITranspilationService.ts        # Core interface abstraction
│   ├── TranspilationServiceImpl.ts     # Main implementation coordinator
│   ├── BinaryProvider.ts               # Native esbuild binary management
│   ├── FallbackChain.ts               # Execution mode orchestration
│   └── FrameworkHandlers.ts           # Framework-specific transpilation
├── providers/
│   ├── NativeEsbuildProvider.ts       # Native binary via IPC
│   ├── WebAssemblyProvider.ts         # esbuild-wasm implementation
│   └── BabelProvider.ts               # Babel fallback implementation
└── cache/
    └── TranspilationCache.ts          # Result caching service

src/renderer/
└── components/                        # UI components (if needed for transpiler management)

tests/
├── unit/
│   ├── transpilation/                 # Unit tests for each service
│   ├── providers/                     # Provider-specific tests
│   └── cache/                         # Cache behavior tests
├── integration/
│   ├── transpilation-flow.test.ts     # End-to-end transpilation tests
│   ├── fallback-chain.test.ts        # Fallback mechanism tests
│   └── performance.test.ts           # Performance benchmark tests
└── fixtures/
    ├── react/                         # Test React artifacts
    ├── vue/                          # Test Vue components
    ├── svelte/                       # Test Svelte components
    └── solid/                        # Test Solid.js components
```

**Structure Decision**: Selected Electron application structure due to the main/renderer process architecture. The transpilation service runs in the main process for maximum performance with native binary access, while the renderer process handles UI. Modular design with each service <500 lines ensures maintainability. Framework-specific handlers are separated for clean architecture and testability.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
