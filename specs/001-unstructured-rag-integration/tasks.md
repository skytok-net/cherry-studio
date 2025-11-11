# Tasks: Unstructured.io RAG Integration

**Input**: Design documents from `/specs/001-unstructured-rag-integration/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the feature specification, so they are not included in these tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Electron app**: `src/main/` (main process), `src/renderer/` (renderer process), `tests/`
- Paths are relative to repository root following existing Cherry Studio structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependencies

- [ ] T001 Install required npm dependencies (axios, bottleneck, file-type, crypto-js, @types/crypto-js)
- [ ] T002 [P] Create database migration for unstructured_jobs table per data-model.md schema
- [ ] T003 [P] Create database migration for unstructured_usage table per data-model.md schema
- [ ] T004 [P] Create database migration for unstructured_cache table per data-model.md schema
- [ ] T005 [P] Create base type definitions in src/main/knowledge/preprocess/types/UnstructuredTypes.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Create UnstructuredApiClient class in src/main/knowledge/preprocess/UnstructuredApiClient.ts
- [ ] T007 Create UnstructuredPreprocessProvider class extending BasePreprocessProvider in src/main/knowledge/preprocess/UnstructuredPreprocessProvider.ts
- [ ] T008 Update PreprocessProviderFactory.ts to register UnstructuredPreprocessProvider
- [ ] T009 [P] Implement configuration validation logic in UnstructuredPreprocessProvider
- [ ] T010 [P] Add UnstructuredConfig to settings store types in src/renderer/src/types/
- [ ] T011 [P] Extend FileMetadata interface with unstructuredProcessed and unstructuredJobId fields
- [ ] T012 [P] Update KnowledgeBaseParams to support UnstructuredConfig in preprocessProvider field

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Enhanced PDF Processing (Priority: P1) 🎯 MVP

**Goal**: Enable complex PDF document processing with tables, images, and improved text extraction using Unstructured.io

**Independent Test**: Upload a complex PDF with tables and images, select Unstructured.io provider, verify superior extraction quality with table structure preserved and searchable

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement HTTP request logic with FormData handling in UnstructuredApiClient.executeProcessing method
- [ ] T014 [P] [US1] Implement response transformation logic in UnstructuredApiClient.transformResponse method
- [ ] T015 [P] [US1] Implement element type mapping from Unstructured.io API response to internal ElementType
- [ ] T016 [US1] Implement parseFile method in UnstructuredPreprocessProvider with PDF processing support
- [ ] T017 [US1] Implement text chunking logic for PDF documents in UnstructuredPreprocessProvider.createTextChunks
- [ ] T018 [US1] Add rate limiting with Bottleneck for hosted API quota management
- [ ] T019 [US1] Implement retry logic with exponential backoff for failed requests
- [ ] T020 [US1] Add comprehensive error handling for PDF processing failures
- [ ] T021 [US1] Add processing progress tracking and IPC updates to renderer

**Checkpoint**: At this point, PDF processing with Unstructured.io should be fully functional and testable independently

---

## Phase 4: User Story 2 - Multi-Format Document Support (Priority: P2)

**Goal**: Support processing of DOCX, XLSX, PPTX and other Office document formats beyond PDFs

**Independent Test**: Upload DOCX, XLSX, and PPTX files and verify successful processing with all content extracted and searchable

### Implementation for User Story 2

- [ ] T022 [P] [US2] Add file type detection and validation for Office formats in UnstructuredPreprocessProvider
- [ ] T023 [P] [US2] Implement DOCX-specific processing parameters and chunking strategies
- [ ] T024 [P] [US2] Implement XLSX-specific processing for multi-sheet spreadsheets
- [ ] T025 [P] [US2] Implement PPTX-specific processing for slide content and speaker notes
- [ ] T026 [US2] Add format-specific metadata extraction for Office documents
- [ ] T027 [US2] Update error handling to include Office document format-specific errors
- [ ] T028 [US2] Extend supported formats list in provider configuration

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently with PDF and Office format support

---

## Phase 5: User Story 3 - Flexible Deployment Options (Priority: P2)

**Goal**: Support both hosted (cloud) and self-hosted Unstructured.io deployments for data privacy requirements

**Independent Test**: Configure self-hosted Unstructured.io endpoint and verify document processing works without external API calls

### Implementation for User Story 3

- [ ] T029 [P] [US3] Add deployment type configuration UI in renderer settings components
- [ ] T030 [P] [US3] Implement self-hosted endpoint validation and health checks
- [ ] T031 [P] [US3] Add authentication handling for hosted vs self-hosted modes
- [ ] T032 [US3] Implement different rate limiting strategies for hosted vs self-hosted
- [ ] T033 [US3] Add network connectivity validation for self-hosted deployments
- [ ] T034 [US3] Update error handling for deployment-specific connection issues
- [ ] T035 [US3] Add deployment type indicator in processing job metadata

**Checkpoint**: Both hosted and self-hosted deployment options should work independently

---

## Phase 6: User Story 4 - Intelligent Chunking Strategy Selection (Priority: P3)

**Goal**: Allow power users to select different chunking strategies (by title, by page, by similarity) for optimal retrieval relevance

**Independent Test**: Process the same document with different chunking strategies and verify chunks are created according to selected strategy

### Implementation for User Story 4

- [ ] T036 [P] [US4] Add chunking strategy selection UI component in renderer settings
- [ ] T037 [P] [US4] Implement by_title chunking logic respecting document hierarchy
- [ ] T038 [P] [US4] Implement by_page chunking logic for discrete page units
- [ ] T039 [P] [US4] Implement by_similarity chunking logic for semantic grouping
- [ ] T040 [US4] Add document structure analysis for optimal strategy selection
- [ ] T041 [US4] Update processing parameters to include user-selected chunking strategy
- [ ] T042 [US4] Add chunking strategy metadata to processed results

**Checkpoint**: Users should be able to select and apply different chunking strategies with visible differences in output

---

## Phase 7: User Story 5 - Provider Selection and Migration (Priority: P3)

**Goal**: Enable gradual migration by allowing provider selection per knowledge base without affecting existing ones

**Independent Test**: Create new knowledge base with Unstructured.io while verifying existing knowledge bases remain unchanged

### Implementation for User Story 5

- [ ] T043 [P] [US5] Add Unstructured.io to preprocessing provider options in settings store
- [ ] T044 [P] [US5] Create provider selection UI component for knowledge base creation
- [ ] T045 [P] [US5] Update knowledge base creation flow to support provider selection
- [ ] T046 [US5] Implement provider migration validation to ensure backward compatibility
- [ ] T047 [US5] Add provider display and management in existing knowledge base settings
- [ ] T048 [US5] Update knowledge base metadata to track selected preprocessing provider
- [ ] T049 [US5] Add provider comparison and migration guidance in UI

**Checkpoint**: All user stories should now be independently functional with complete provider selection capabilities

---

## Phase 8: Performance Optimization & Caching

**Purpose**: Implement caching and performance features for production readiness

- [ ] T050 [P] Implement in-memory LRU cache for frequent document processing results
- [ ] T051 [P] Implement disk-based cache using unstructured_cache table schema
- [ ] T052 [P] Add file hash generation for cache key creation using crypto-js
- [ ] T053 Create multi-level cache architecture with memory-first, disk-fallback strategy
- [ ] T054 [P] Implement cache eviction policies based on size and access patterns
- [ ] T055 [P] Add cache hit/miss metrics tracking for performance monitoring
- [ ] T056 Add processing job persistence using unstructured_jobs table
- [ ] T057 Implement usage metrics tracking using unstructured_usage table

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T058 [P] Add comprehensive logging throughout all processing flows using loggerService
- [ ] T059 [P] Implement secure API key storage using Electron's safeStorage API
- [ ] T060 [P] Add processing cost estimation and quota tracking for hosted deployments
- [ ] T061 Add health monitoring and service availability checks
- [ ] T062 [P] Update documentation in quickstart.md with final implementation
- [ ] T063 [P] Add configuration examples for both hosted and self-hosted setups
- [ ] T064 Implement fallback mechanisms when Unstructured.io services are unavailable
- [ ] T065 Add processing timeout handling and user feedback for long operations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P2 → P3 → P3)
- **Performance (Phase 8)**: Can start after any user story is complete, recommended after US1
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May leverage US1 infrastructure but independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but independently testable
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - Leverages chunking from US1 but independently testable
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Requires US1 as example provider but independently testable

### Within Each User Story

- API client infrastructure before provider implementation
- Configuration and validation before processing logic
- Core processing before advanced features (chunking, caching)
- Error handling after main implementation
- UI components can be developed in parallel with backend logic

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Tasks within each user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- Performance and Polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all parallel tasks for User Story 1 together:
Task: "Implement HTTP request logic with FormData handling in UnstructuredApiClient.executeProcessing method"
Task: "Implement response transformation logic in UnstructuredApiClient.transformResponse method"
Task: "Implement element type mapping from Unstructured.io API response to internal ElementType"

# Then the sequential integration tasks:
Task: "Implement parseFile method in UnstructuredPreprocessProvider with PDF processing support"
Task: "Implement text chunking logic for PDF documents in UnstructuredPreprocessProvider.createTextChunks"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Enhanced PDF Processing)
4. **STOP and VALIDATE**: Test complex PDF processing independently
5. Deploy/demo if ready - users can now process PDFs with improved extraction

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP - PDF processing!)
3. Add User Story 2 → Test independently → Deploy/Demo (Office formats added)
4. Add User Story 3 → Test independently → Deploy/Demo (Self-hosted option added)
5. Add User Story 4 → Test independently → Deploy/Demo (Advanced chunking added)
6. Add User Story 5 → Test independently → Deploy/Demo (Full provider selection)
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (PDF processing)
   - Developer B: User Story 2 (Office formats)
   - Developer C: User Story 3 (Deployment options)
3. Stories complete and integrate independently
4. Add Performance optimization and Polish phases

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Follow existing Cherry Studio patterns (factory pattern, logging via loggerService)
- Maintain backward compatibility with existing preprocessing providers
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence