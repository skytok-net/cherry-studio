# Tasks: Transpiler Service Rearchitecture

**Input**: Design documents from `/specs/003-transpiler-service-rearchitecture/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this is an Electron application with main/renderer architecture:
- **Main process services**: `src/main/services/`
- **Renderer components**: `src/renderer/components/`
- **Tests**: `tests/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project structure per implementation plan with src/main/services/transpilation/ directories
- [x] T002 Install TypeScript dependencies: esbuild, esbuild-wasm, @babel/core in package.json
- [x] T003 [P] Install framework plugins: @rollup/plugin-commonjs for React/Vue/Svelte/Solid support via Rolldown in package.json
- [x] T004 [P] Configure Vitest for unit and integration testing in vitest.config.ts
- [x] T005 [P] Update electron-builder.yml with macOS sandbox entitlements for binary execution
- [x] T006 [P] Create test fixtures directories: tests/fixtures/react/, tests/fixtures/vue/, tests/fixtures/svelte/, tests/fixtures/solid/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Implement ITranspilationService interface in src/main/services/transpilation/ITranspilationService.ts
- [x] T008 [P] Implement IBinaryProvider interface in src/main/services/transpilation/IBinaryProvider.ts
- [x] T009 [P] Implement IFrameworkHandler interface in src/main/services/transpilation/IFrameworkHandler.ts
- [x] T010 [P] Implement ITranspilationProvider interface in src/main/services/providers/ITranspilationProvider.ts
- [x] T011 [P] Implement IFallbackChain interface in src/main/services/transpilation/IFallbackChain.ts
- [x] T012 [P] Implement ITranspilationCache interface in src/main/services/cache/ITranspilationCache.ts
- [x] T013 Create BinaryProvider implementation in src/main/services/transpilation/BinaryProvider.ts for cross-platform binary detection
- [x] T014 Create TranspilationCache implementation in src/main/services/cache/TranspilationCache.ts with LRU caching and SHA-256 hashing
- [x] T015 Create FallbackChain implementation in src/main/services/transpilation/FallbackChain.ts for provider orchestration

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - React Component Transpilation Works Reliably (Priority: P1) 🎯 MVP

**Goal**: Native esbuild transpilation of React/TypeScript with graceful fallback to WebAssembly and Babel

**Independent Test**: Create React artifact with JSX/TSX syntax, verify it transpiles in <100ms and renders correctly

### Implementation for User Story 1

- [ ] T016 [P] [US1] Create ReactHandler implementation in src/main/services/transpilation/FrameworkHandlers/ReactHandler.ts
- [ ] T017 [P] [US1] Create NativeEsbuildProvider implementation in src/main/services/providers/NativeEsbuildProvider.ts with IPC via child_process.spawn()
- [ ] T018 [P] [US1] Create WebAssemblyProvider implementation in src/main/services/providers/WebAssemblyProvider.ts using esbuild-wasm
- [ ] T019 [P] [US1] Create BabelProvider implementation in src/main/services/providers/BabelProvider.ts as final fallback
- [ ] T020 [US1] Implement TranspilationServiceImpl in src/main/services/transpilation/TranspilationServiceImpl.ts coordinating all providers
- [ ] T021 [US1] Add React-specific test fixtures in tests/fixtures/react/ with JSX, TSX, and component examples
- [ ] T022 [US1] Add performance validation ensuring React transpilation completes in <100ms native, <500ms WebAssembly
- [ ] T023 [US1] Add error handling with structured TranspilationError reporting source locations and suggestions
- [ ] T024 [US1] Add logging integration with existing loggerService for transpilation operations
- [ ] T025 [US1] Integrate service with existing artifact system to replace current transpiler

**Checkpoint**: At this point, React transpilation should be fully functional with three-tier fallback

---

## Phase 4: User Story 2 - Cross-Platform Binary Distribution (Priority: P2)

**Goal**: Proper bundling and execution of native esbuild binaries across all supported platforms

**Independent Test**: Build packaged application for each platform and verify native esbuild executes without "spawn ENOTDIR" errors

### Implementation for User Story 2

- [ ] T026 [P] [US2] Update BinaryProvider.ts to detect platform-specific binaries for macOS Intel/ARM, Windows x64/ARM, Linux x64/ARM
- [ ] T027 [P] [US2] Add binary permission validation and executable setting in BinaryProvider.ts
- [ ] T028 [US2] Update electron-builder.yml to bundle native esbuild binaries in dist-electron/ for each platform
- [ ] T029 [US2] Add macOS sandbox compliance validation in BinaryProvider.ts checking security entitlements
- [ ] T030 [US2] Add binary integrity verification with hash checking in BinaryProvider.ts
- [ ] T031 [US2] Add fallback binary download mechanism for missing or corrupted binaries
- [ ] T032 [US2] Add comprehensive platform testing with cross-platform build validation
- [ ] T033 [US2] Update scripts/after-pack.js to set proper executable permissions during packaging

**Checkpoint**: At this point, native binary execution should work reliably across all supported platforms

---

## Phase 5: User Story 4 - Performance Optimization and Fallback Handling (Priority: P2)

**Goal**: Graceful degradation through fallback chain with performance monitoring and user feedback

**Independent Test**: Simulate binary failures and verify WebAssembly/Babel fallbacks work with acceptable performance

### Implementation for User Story 4

- [ ] T034 [P] [US4] Add fallback performance monitoring in FallbackChain.ts tracking execution times and success rates
- [ ] T035 [P] [US4] Add provider health status tracking in FallbackChain.ts with degradation detection
- [ ] T036 [US4] Implement timeout mechanisms in each provider preventing indefinite blocking
- [ ] T037 [US4] Add user feedback system showing active execution mode and performance characteristics
- [ ] T038 [US4] Add performance benchmarking tests in tests/integration/performance.test.ts validating success criteria
- [ ] T039 [US4] Add memory usage tracking during WebAssembly initialization and transpilation
- [ ] T040 [US4] Add concurrent request handling supporting 50 simultaneous transpilations
- [ ] T041 [US4] Add cache hit rate optimization and LRU eviction monitoring
- [ ] T042 [US4] Add error recovery mechanisms with provider reset and retry logic

**Checkpoint**: At this point, fallback chain should provide reliable degradation with performance visibility

---

## Phase 6: User Story 3 - Multi-Framework Artifact Support (Priority: P3)

**Goal**: Transpilation support for Vue, Svelte, and Solid.js with framework-specific optimizations

**Independent Test**: Create artifacts in each framework and verify proper transpilation with framework-specific features

### Implementation for User Story 3

- [ ] T043 [P] [US3] Create VueHandler implementation in src/main/services/transpilation/FrameworkHandlers/VueHandler.ts for SFC compilation
- [ ] T044 [P] [US3] Create SvelteHandler implementation in src/main/services/transpilation/FrameworkHandlers/SvelteHandler.ts with CSS injection
- [ ] T045 [P] [US3] Create SolidHandler implementation in src/main/services/transpilation/FrameworkHandlers/SolidHandler.ts with Solid-specific JSX
- [ ] T046 [P] [US3] Add Vue test fixtures in tests/fixtures/vue/ with SFC examples and style blocks
- [ ] T047 [P] [US3] Add Svelte test fixtures in tests/fixtures/svelte/ with component and CSS examples
- [ ] T048 [P] [US3] Add Solid.js test fixtures in tests/fixtures/solid/ with JSX and reactive examples
- [ ] T049 [US3] Update framework registry in TranspilationServiceImpl.ts to route requests to appropriate handlers
- [ ] T050 [US3] Add framework-specific plugin configuration for esbuild in each handler
- [ ] T051 [US3] Add framework validation and preprocessing in each handler
- [ ] T052 [US3] Add framework-specific error handling and debugging information

**Checkpoint**: All frameworks should now be independently functional with optimized transpilation

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T053 [P] Add comprehensive unit tests in tests/unit/transpilation/ for all service components
- [ ] T054 [P] Add integration tests in tests/integration/transpilation-flow.test.ts for end-to-end scenarios
- [ ] T055 [P] Add integration tests in tests/integration/fallback-chain.test.ts for provider switching
- [ ] T056 Add 500-line file limit validation ensuring all services stay under constraint
- [ ] T057 Add performance regression testing with automated benchmarks
- [ ] T058 [P] Update documentation in docs/ with API reference and usage examples
- [ ] T059 Add security validation for input sanitization and error message sanitization
- [ ] T060 Run quickstart.md validation ensuring all examples work correctly
- [ ] T061 Add memory leak detection and cleanup validation
- [ ] T062 [P] Code cleanup and refactoring to eliminate technical debt

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Enhances US1 but US1 remains independently testable
- **User Story 4 (P2)**: Can start after US1 core implementation - Enhances fallback mechanisms
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses same architecture as US1

### Within Each User Story

- Interface implementations before concrete implementations
- Provider implementations before service coordination
- Core functionality before error handling and performance optimization
- Framework handlers can be developed in parallel
- Test fixtures can be created in parallel with implementations

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational interface tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Framework handlers within US3 marked [P] can run in parallel
- Provider implementations within US1 marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all provider implementations for User Story 1 together:
Task: "Create NativeEsbuildProvider implementation in src/main/services/providers/NativeEsbuildProvider.ts"
Task: "Create WebAssemblyProvider implementation in src/main/services/providers/WebAssemblyProvider.ts"
Task: "Create BabelProvider implementation in src/main/services/providers/BabelProvider.ts"

# Launch framework handler creation together:
Task: "Create ReactHandler implementation in src/main/services/transpilation/FrameworkHandlers/ReactHandler.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test React transpilation independently with all three fallback modes
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test React transpilation independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test cross-platform binary execution → Deploy/Demo
4. Add User Story 4 → Test performance optimization and fallback → Deploy/Demo
5. Add User Story 3 → Test multi-framework support → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (React transpilation)
   - Developer B: User Story 2 (Cross-platform binaries)
   - Developer C: User Story 4 (Performance optimization)
   - Developer D: User Story 3 (Multi-framework support)
3. Stories complete and integrate independently

---

## Success Criteria Validation

Each phase must validate against the measurable outcomes from spec.md:

**Phase 3 (US1) Success Criteria:**
- SC-001: React transpilation <100ms native esbuild
- SC-002: WebAssembly fallback <500ms
- SC-005: Zero "spawn ENOTDIR" errors
- SC-006: All files under 500 lines

**Phase 4 (US2) Success Criteria:**
- SC-005: Zero "spawn ENOTDIR" errors across platforms
- SC-007: 100% native binary execution success
- SC-004: 99.9% transpilation success rate

**Phase 5 (US4) Success Criteria:**
- SC-003: 50 concurrent requests without degradation
- SC-008: 95% fallback chain success rate
- SC-009: Memory usage under 100MB
- SC-010: 90% of errors include actionable information

**Phase 6 (US3) Success Criteria:**
- SC-004: 99.9% success rate across all frameworks
- Framework-specific transpilation working correctly

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- All files must remain under 500 lines per requirement FR-002
- Verify fallback chain works before implementing next priority
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Focus on React first (P1) then expand to other frameworks