# Artifact Transpiler Test Utility

This is a standalone Node.js TypeScript CLI utility that demonstrates how the Cherry Studio artifact transpiler uses esbuild with various framework plugins to transpile component code.

## Purpose

This utility helps you understand what's really needed to transpile framework components by:
- Using the same esbuild plugins as the main application
- Processing imports the same way (converting to global variable access)
- Wrapping output in the same CommonJS module wrapper
- Showing transpilation performance for each framework

## Frameworks Supported

- **React** - JSX/TSX transpilation with esbuild-plugin-react18
- **Preact** - Same as React (compatible JSX syntax)
- **Svelte** - Single File Component (SFC) transpilation with esbuild-svelte
- **Vue** - SFC transpilation with esbuild-plugin-vue3
- **Solid** - JSX transpilation with esbuild-plugin-solid

## Installation

```bash
cd node-test
yarn install
```

## Usage

### Transpile all frameworks (default)
```bash
yarn transpile
# or
yarn transpile:all
```

### Transpile specific framework
```bash
yarn transpile:react
yarn transpile:svelte
yarn transpile:vue
yarn transpile:solid
yarn transpile:preact
```

### Custom framework selection
```bash
yarn transpile --framework=react
```

## Output

Transpiled JavaScript files are written to `node-test/output/`:
- `react.js` - Transpiled React component
- `svelte.js` - Transpiled Svelte component
- `vue.js` - Transpiled Vue component
- `solid.js` - Transpiled Solid component
- `preact.js` - Transpiled Preact component

## Sample Components

Sample components are located in `src/samples/`:
- `react.tsx` - React counter with ReactFlow diagram
- `svelte.svelte` - Svelte counter
- `vue.vue` - Vue counter
- `solid.tsx` - Solid counter
- `preact.tsx` - Preact counter

All samples demonstrate:
- State management
- Event handling
- Conditional rendering
- Tailwind CSS styling
- Framework-specific patterns

## How It Works

### 1. Import Pre-processing
The utility transforms ES6 imports into global variable access:

```javascript
// Input
import { ReactFlow } from '@xyflow/react';

// Output (before transpilation)
const ReactFlow = window.ReactFlow.ReactFlow;
```

This allows components to work in a browser sandbox environment where libraries are loaded via CDN.

### 2. Transpilation
Each framework uses its specific esbuild plugin:
- React/Preact: `esbuild-plugin-react18`
- Svelte: `esbuild-svelte`
- Vue: `esbuild-plugin-vue3`
- Solid: `esbuild-plugin-solid`

### 3. Module Wrapping
The transpiled code is wrapped in a CommonJS-style IIFE that:
- Provides a `require()` polyfill for module resolution
- Exports the component to `window.__tsxComponent`
- Cleans up previous component exports
- Handles both default and named exports

### 4. Output
The final JavaScript can be executed in a browser environment where React, ReactFlow, Lucide, etc. are available as global variables.

## Key Differences from Main App

This utility **does not include**:
- IPC communication (main process ↔ renderer process)
- Auto-retry with LLM error fixing
- Iframe sandbox management
- Error recovery mechanisms

This utility **focuses on**:
- Pure transpilation logic
- Plugin configuration
- Import transformation
- Performance measurement

## Performance

Typical transpilation times:
- React/Preact: 10-30ms
- Svelte: 50-100ms (includes bundling)
- Vue: 50-100ms (includes bundling)
- Solid: 10-30ms

## Debugging

To see more detailed output from esbuild, modify the `logLevel` in `src/transpiler.ts`:

```typescript
logLevel: 'info'  // Change from 'warning'
```

## Related Files

In the main application:
- `src/main/services/ArtifactTranspilerService.ts` - Full service with IPC
- `src/renderer/src/components/CodeBlockView/UniversalArtifactViewer.tsx` - Viewer component
- `TSX_ARTIFACTS_SUPPORT.md` - Full documentation

## License

Same as Cherry Studio main project.
