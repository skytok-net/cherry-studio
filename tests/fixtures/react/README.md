# React Test Fixtures

This directory contains comprehensive test fixtures for validating React transpilation functionality across different scenarios and complexity levels.

## Test Coverage

### Basic Transpilation Tests
- **SimpleComponent.jsx** - Basic JSX transpilation without TypeScript
- **TypeScriptComponent.tsx** - TypeScript + JSX transpilation with interfaces and hooks
- **WithoutReactImport.jsx** - Tests automatic React import injection

### Advanced React Patterns
- **ComplexComponent.tsx** - Advanced TypeScript patterns, multiple hooks, complex state management
- **ClassComponent.jsx** - React class components with lifecycle methods
- **FragmentTest.jsx** - React Fragments and short syntax
- **ConditionalRendering.tsx** - Various conditional rendering patterns

### Error Handling & Async Patterns
- **ErrorComponent.jsx** - Error boundaries and error handling patterns
- **AsyncComponent.tsx** - Async patterns, Suspense, lazy loading, data fetching

## Validation Scenarios

Each fixture tests specific aspects of the transpilation service:

### Framework Handler Tests (ReactHandler)
- JSX syntax detection and processing
- TypeScript integration
- React import injection
- Component pattern validation
- Hook usage validation

### Provider Tests
- **Native esbuild**: Fast transpilation of all fixtures
- **WebAssembly**: Cross-platform fallback for all patterns
- **Babel**: Universal fallback with complex preset handling

### Performance Targets
- Native esbuild: <100ms for all fixtures
- WebAssembly: <500ms for all fixtures
- Babel: <2000ms for all fixtures

## Usage in Tests

```typescript
import { readFile } from 'fs/promises';
import { TranspilationServiceImpl } from '../../../src/main/services/transpilation/TranspilationServiceImpl';

// Load fixture
const simpleComponentSource = await readFile(
  './tests/fixtures/react/SimpleComponent.jsx',
  'utf8'
);

// Test transpilation
const service = new TranspilationServiceImpl();
await service.initialize();

const result = await service.transpile({
  code: simpleComponentSource,
  framework: 'react',
  filename: 'SimpleComponent.jsx'
});
```

## Expected Transpilation Outputs

### SimpleComponent.jsx → Transpiled
- JSX elements converted to React.createElement calls
- ES modules preserved or converted based on target
- Source maps generated

### TypeScriptComponent.tsx → Transpiled
- TypeScript types stripped
- Interfaces removed
- JSX converted
- Hook calls preserved

### ComplexComponent.tsx → Transpiled
- Complex TypeScript patterns handled
- Multiple hook dependencies preserved
- Event handlers properly bound
- Memoization patterns maintained

## Error Cases to Test

### ReactHandler Validation
- Unclosed JSX tags (should error)
- Invalid hook usage patterns (should warn)
- Missing React import (should auto-inject)
- Performance anti-patterns (should warn if enabled)

### Provider Fallback Chain
- Native binary unavailable → Falls back to WebAssembly
- WebAssembly unavailable → Falls back to Babel
- All providers fail → Structured error reporting

### Performance Validation
- Files exceeding size limits (1MB+)
- Complex nested components
- Large number of hooks and state variables

## Test Structure

```
tests/fixtures/react/
├── README.md                 # This file
├── SimpleComponent.jsx       # Basic JSX
├── TypeScriptComponent.tsx   # TypeScript + JSX
├── ComplexComponent.tsx      # Advanced patterns
├── WithoutReactImport.jsx    # Auto-import test
├── ClassComponent.jsx        # Class components
├── FragmentTest.jsx          # Fragment patterns
├── ConditionalRendering.tsx  # Conditional JSX
├── ErrorComponent.jsx        # Error boundaries
└── AsyncComponent.tsx        # Async patterns
```

## Metrics to Validate

For each fixture, the transpilation service should track:
- Execution time per provider
- Cache hit/miss rates
- Memory usage patterns
- Success/failure rates
- Provider usage distribution
- Framework-specific optimizations applied