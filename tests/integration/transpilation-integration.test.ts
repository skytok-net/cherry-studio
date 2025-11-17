/**
 * Integration Test for Transpilation Service
 * Tests the complete integration with the legacy artifact system
 * Feature: 003-transpiler-service-rearchitecture
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { artifactTranspilerService } from '../../src/main/services/transpilation/LegacyArtifactTranspilerService';
import type { TranspileRequest, TranspileResult } from '../../src/main/services/transpilation/LegacyArtifactTranspilerService';

// Mock esbuild module for tests
vi.mock('esbuild', () => ({
  transform: vi.fn().mockResolvedValue({
    code: 'React.createElement("div", null, "Hello, World!");',
    map: null,
    warnings: []
  }),
  buildSync: vi.fn().mockReturnValue({
    outputFiles: [{ text: 'React.createElement("div", null, "Hello, World!");' }],
    warnings: []
  })
}));

describe('Transpilation Integration', () => {
  beforeAll(async () => {
    // Service auto-initializes on first use
  });

  afterAll(async () => {
    await artifactTranspilerService.dispose();
  });

  describe('Legacy Interface Compatibility', () => {
    it('should transpile simple React JSX component', async () => {
      const request: TranspileRequest = {
        code: `
          function HelloWorld({ name }) {
            return <div>Hello, {name}!</div>;
          }
          export default HelloWorld;
        `,
        framework: 'react',
        language: 'javascript',
        filename: 'HelloWorld.jsx'
      };

      const result: TranspileResult = await artifactTranspilerService.transpile(request);

      expect(result.code).toBeTruthy();
      expect(result.code).toContain('React.createElement');
      expect(result.code).toContain('Hello,');
      expect(result.map).toBeUndefined(); // Source maps may be undefined for simple cases
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should transpile TypeScript React component', async () => {
      const request: TranspileRequest = {
        code: `
          interface Props {
            name: string;
            age?: number;
          }

          function UserProfile({ name, age }: Props) {
            return (
              <div>
                <h1>{name}</h1>
                {age && <p>Age: {age}</p>}
              </div>
            );
          }

          export default UserProfile;
        `,
        framework: 'react',
        language: 'typescript',
        filename: 'UserProfile.tsx'
      };

      const result: TranspileResult = await artifactTranspilerService.transpile(request);

      expect(result.code).toBeTruthy();
      expect(result.code).toContain('React.createElement');
      expect(result.code).toContain('UserProfile');
      // TypeScript types should be removed
      expect(result.code).not.toContain('interface Props');
      expect(result.code).not.toContain(': Props');
    });

    it('should handle complex React patterns', async () => {
      const request: TranspileRequest = {
        code: `
          import React, { useState, useEffect } from 'react';

          function TodoList() {
            const [todos, setTodos] = useState([]);
            const [input, setInput] = useState('');

            useEffect(() => {
              console.log('Todos updated:', todos);
            }, [todos]);

            const addTodo = () => {
              if (input.trim()) {
                setTodos([...todos, { id: Date.now(), text: input, done: false }]);
                setInput('');
              }
            };

            return (
              <div className="todo-app">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTodo()}
                />
                <button onClick={addTodo}>Add Todo</button>
                <ul>
                  {todos.map(todo => (
                    <li key={todo.id} className={todo.done ? 'done' : ''}>
                      {todo.text}
                    </li>
                  ))}
                </ul>
              </div>
            );
          }

          export default TodoList;
        `,
        framework: 'react',
        language: 'javascript',
        filename: 'TodoList.jsx'
      };

      const result: TranspileResult = await artifactTranspilerService.transpile(request);

      expect(result.code).toBeTruthy();
      expect(result.code).toContain('useState');
      expect(result.code).toContain('useEffect');
      expect(result.code).toContain('React.createElement');
      expect(result.code).toContain('TodoList');
    });

    it('should handle JSX without React import', async () => {
      const request: TranspileRequest = {
        code: `
          function SimpleComponent() {
            return <div>No React import here!</div>;
          }
          export default SimpleComponent;
        `,
        framework: 'react',
        language: 'javascript',
        filename: 'SimpleComponent.jsx'
      };

      const result: TranspileResult = await artifactTranspilerService.transpile(request);

      expect(result.code).toBeTruthy();
      expect(result.code).toContain('React.createElement');
      expect(result.code).toContain('No React import here!');
    });

    it('should provide error information for invalid code', async () => {
      const request: TranspileRequest = {
        code: `
          function BrokenComponent() {
            return <div>Missing closing tag;
          }
        `,
        framework: 'react',
        language: 'javascript',
        filename: 'BrokenComponent.jsx'
      };

      await expect(artifactTranspilerService.transpile(request))
        .rejects.toThrow();
    });
  });

  describe('Service Health', () => {
    it('should report healthy status after successful transpilation', async () => {
      const request: TranspileRequest = {
        code: 'function Test() { return <div>Test</div>; }',
        framework: 'react',
        language: 'javascript',
        filename: 'Test.jsx'
      };

      await artifactTranspilerService.transpile(request);

      expect(artifactTranspilerService.isHealthy()).toBe(true);
    });

    it('should provide service status information', async () => {
      const status = artifactTranspilerService.getStatus();

      expect(status).toBeDefined();
      expect(typeof status.isInitialized).toBe('boolean');
      expect(typeof status.isHealthy).toBe('boolean');
    });
  });

  describe('Framework Support', () => {
    const frameworks: Array<'react' | 'vue' | 'svelte' | 'solid'> = ['react'];

    frameworks.forEach(framework => {
      it(`should support ${framework} framework`, async () => {
        const code = framework === 'react'
          ? 'function Component() { return <div>Test</div>; }'
          : 'function Component() { return "test"; }'; // Placeholder for other frameworks

        const request: TranspileRequest = {
          code,
          framework,
          language: 'javascript',
          filename: `Component.${framework === 'react' ? 'jsx' : 'js'}`
        };

        if (framework === 'react') {
          const result = await artifactTranspilerService.transpile(request);
          expect(result.code).toBeTruthy();
        } else {
          // For now, other frameworks might not be fully implemented
          // This test will pass when they are added
          try {
            const result = await artifactTranspilerService.transpile(request);
            expect(result.code).toBeTruthy();
          } catch (error) {
            // Expected for unimplemented frameworks
            expect(error).toBeInstanceOf(Error);
          }
        }
      });
    });
  });
});