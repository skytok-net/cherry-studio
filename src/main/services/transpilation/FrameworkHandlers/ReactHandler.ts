/**
 * React Framework Handler Implementation
 * Handles React/JSX/TSX transpilation with framework-specific optimizations
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  IFrameworkHandler,
  FrameworkCapabilities,
  FrameworkConfig,
  PreprocessResult,
  RawTranspilationResult,
  ValidationResult
} from '../IFrameworkHandler';
import type {
  ArtifactFramework,
  TranspilationResult,
  TranspilationOptions
} from '../ITranspilationService';

export class ReactHandler implements IFrameworkHandler {
  readonly framework: ArtifactFramework = 'react';
  private config: FrameworkConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<FrameworkConfig>) {
    this.config = {
      framework: 'react',
      plugins: [],
      esbuildOptions: {
        jsx: 'transform',
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        target: 'es2018'
      },
      loaders: {},
      externals: [],
      define: {},
      ...config
    };
  }

  /**
   * Check if this handler can process the given framework
   * Maps to React artifact identification
   */
  canHandle(framework: ArtifactFramework): boolean {
    return framework === 'react';
  }

  /**
   * Configure handler with framework-specific settings
   * Maps to React-specific transpilation setup
   */
  configure(options: TranspilationOptions): FrameworkConfig {
    // Update esbuildOptions based on transpilation options
    if (options.jsx) {
      this.config.esbuildOptions.jsx = options.jsx === 'preserve' ? 'preserve' : 'transform';
    }
    if (options.target) {
      this.config.esbuildOptions.target = options.target;
    }
    if (options.minify !== undefined) {
      this.config.esbuildOptions.minify = options.minify;
    }
    this.isInitialized = true;
    return this.config;
  }

  /**
   * Preprocess React code before transpilation
   * Maps to JSX/TSX preparation and validation
   */
  preprocess(code: string, filename?: string): PreprocessResult {
    if (!this.isInitialized) {
      throw new Error('ReactHandler not initialized - call configure() first');
    }

    let transformedCode = code;
    const transformations: string[] = [];

    try {
      // Add React import if missing but JSX is used
      if (this.hasJSXElements(transformedCode) && !this.hasReactImport(transformedCode)) {
        const reactImport = this.generateReactImport();
        transformedCode = `${reactImport}\n${transformedCode}`;
        transformations.push('added-react-import');
      }

      // Handle JSX pragma if needed
      if (this.config.esbuildOptions.jsxFactory !== 'React.createElement') {
        transformedCode = this.addJSXPragma(transformedCode);
        transformations.push('jsx-pragma');
      }

      // TypeScript-specific preprocessing
      if (filename && this.isTypeScriptFile(filename)) {
        transformedCode = this.preprocessTypeScript(transformedCode);
        transformations.push('typescript-prep');
      }

      return {
        code: transformedCode,
        modified: transformedCode !== code,
        warnings: transformations.length > 0 ? [{
          message: `Applied ${transformations.length} transformation(s)`,
          type: 'framework' as const
        }] : undefined
      };
    } catch (error) {
      return {
        code: transformedCode,
        modified: false,
        warnings: [{
          message: `Preprocessing warning: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'framework' as const
        }]
      };
    }
  }

  /**
   * Post-process transpiled React code
   * Maps to React-specific optimizations and cleanup
   */
  postprocess(result: RawTranspilationResult): TranspilationResult {
    let optimizedCode = result.code;

    try {
      // Apply basic optimizations if needed
      // Note: FrameworkConfig doesn't have optimizations property, so we skip those
      
      return {
        code: optimizedCode,
        map: result.map,
        warnings: result.warnings?.map(w => ({
          message: typeof w === 'string' ? w : w.message || 'Unknown warning',
          location: typeof w === 'object' && w.location ? {
            file: w.location.file || '',
            line: w.location.line || 0,
            column: w.location.column || 0,
            lineText: w.location.lineText || ''
          } : undefined,
          severity: typeof w === 'object' && w.severity ? w.severity : 'warning'
        })) || [],
        executionMode: 'native', // Default, will be set by service
        duration: 0, // Will be set by service
        cacheHit: false // Will be set by service
      };
    } catch (error) {
      // Return original result if post-processing fails
      return {
        code: result.code,
        map: result.map,
        warnings: result.warnings?.map(w => ({
          message: typeof w === 'string' ? w : w.message || 'Unknown warning',
          location: undefined,
          severity: 'warning' as const
        })) || [],
        executionMode: 'native',
        duration: 0,
        cacheHit: false
      };
    }
  }

  /**
   * Get React framework capabilities
   * Maps to feature detection and compatibility reporting
   */
  getCapabilities(): FrameworkCapabilities {
    return {
      framework: this.framework,
      supportedExtensions: ['.js', '.ts', '.jsx', '.tsx'],
      supportsTypeScript: true,
      supportsJSX: true,
      supportsCSSImports: true,
      supportsAssetImports: true,
      requiredExternals: ['react'],
      features: ['single-file-components', 'css-modules', 'styled-components', 'hot-module-reload', 'server-side-rendering', 'static-generation', 'code-splitting']
    };
  }

  /**
   * Validate React code syntax and patterns
   * Maps to React-specific code validation
   */
  validateCode(code: string): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];
    const suggestions: any[] = [];

    try {
      // Basic JSX syntax validation
      this.validateJSXSyntax(code, errors);

      // React-specific pattern validation
      this.validateReactPatterns(code, errors, warnings);

      // Hook usage validation
      this.validateHookUsage(code, warnings, suggestions);

      return {
        isValid: errors.length === 0,
        errors: errors.map(e => ({
          code: e.code || 'VALIDATION_ERROR',
          message: e.message || 'Unknown error',
          location: e.location,
          severity: 'error' as const
        })),
        warnings: warnings.map(w => ({
          code: typeof w === 'string' ? 'WARNING' : w.code || 'WARNING',
          message: typeof w === 'string' ? w : w.message || 'Unknown warning',
          location: typeof w === 'object' ? w.location : undefined
        })),
        suggestions: suggestions.map(s => ({
          message: typeof s === 'string' ? s : s.message || 'Unknown suggestion',
          location: typeof s === 'object' ? s.location : undefined,
          replacement: typeof s === 'object' ? s.replacement : undefined,
          confidence: typeof s === 'object' && s.confidence ? s.confidence : 'medium' as const
        }))
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: `React validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          location: undefined,
          severity: 'error' as const
        }],
        warnings: [],
        suggestions: []
      };
    }
  }

  // Private helper methods


  private hasJSXElements(code: string): boolean {
    // Simple JSX detection - looks for opening tags
    return /<[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?>/.test(code);
  }

  private hasReactImport(code: string): boolean {
    return /import\s+(?:.*\s+from\s+)?['"]react['"]/.test(code);
  }

  private generateReactImport(): string {
    return "import React from 'react';";
  }

  private isTypeScriptFile(filename?: string): boolean {
    return filename ? /\.tsx?$/.test(filename) : false;
  }

  private addJSXPragma(code: string): string {
    const pragma = `/** @jsx ${this.config.esbuildOptions.jsxFactory} */`;
    return `${pragma}\n${code}`;
  }

  private preprocessTypeScript(code: string): string {
    // Basic TypeScript preprocessing for React
    // Remove type-only imports that might cause issues
    return code.replace(/import\s+type\s+[^;]+;/g, '');
  }

  // Removed unused placeholder methods - can be re-added when needed


  private validateJSXSyntax(_code: string, issues: any[]): void {
    // Basic JSX syntax validation
    const unclosedTags = _code.match(/<[A-Za-z][A-Za-z0-9]*(?:\s[^>]*)?(?<!\/|>)$/gm);
    if (unclosedTags) {
      issues.push({
        code: 'JSX_SYNTAX_ERROR',
        message: 'Unclosed JSX tags detected',
        location: undefined
      });
    }
  }

  private validateReactPatterns(code: string, _issues: any[], warnings: any[]): void {
    // Check for common React anti-patterns
    if (code.includes('dangerouslySetInnerHTML') && !code.includes('// SAFETY:')) {
      warnings.push('dangerouslySetInnerHTML used without safety comment');
    }
  }

  private validateHookUsage(code: string, _warnings: any[], suggestions: any[]): void {
    // Check hook rules
    const hookCalls = code.match(/use[A-Z][a-zA-Z]*\(/g);
    if (hookCalls) {
      // Basic hook usage validation
      suggestions.push('Ensure hooks are called at the top level of components');
    }
  }

  // Removed unused placeholder methods - can be re-added when needed

}