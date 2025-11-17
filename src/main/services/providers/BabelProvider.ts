/**
 * Babel Provider Implementation
 * Universal JavaScript/TypeScript transpilation fallback using Babel
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  IBabelProvider,
  ProviderInfo,
  ProviderError,
  ProviderResult,
  ProviderCapabilities,
  ProviderHealthStatus,
  BabelConfig,
  BabelResult
} from './ITranspilationProvider';
import type {
  TranspilationRequest,
  ArtifactFramework
} from '../transpilation/ITranspilationService';
import type { FrameworkConfig } from '../transpilation/IFrameworkHandler';

// Dynamic imports for Babel to handle optional dependencies
let babelCore: any = null;
let babelPresetEnv: any = null;
let babelPresetReact: any = null;
let babelPresetTypeScript: any = null;

interface BabelMetrics {
  totalAttempts: number;
  successfulTranspilations: number;
  failedTranspilations: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  fastestExecution: number;
  slowestExecution: number;
  successRate: number;
  pluginUsage: Record<string, number>;
  presetUsage: Record<string, number>;
  isInitialized: boolean;
  initializationTime: number;
}

export class BabelProvider implements IBabelProvider {
  private isInitialized: boolean = false;
  private config: BabelConfig;
  private metrics: BabelMetrics;

  constructor(config?: Partial<BabelConfig>) {
    this.config = {
      presets: [
        ['@babel/preset-env', { modules: false, targets: { esmodules: true } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        ['@babel/preset-typescript', { allowDeclareFields: true }]
      ],
      plugins: [],
      sourceMaps: true,
      ...config
    };

    this.metrics = this.initializeMetrics();
  }

  /**
   * Get provider information and capabilities
   * Maps to Babel transpilation characteristics
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'Babel Transpiler',
      executionMode: 'babel',
      version: this.getBabelVersion() || 'unknown',
      description: 'Universal JavaScript/TypeScript transpilation fallback using Babel',
      priority: 3 // Lowest priority - fallback only
    };
  }

  /**
   * Check if Babel is available with required dependencies
   * Maps to package availability detection
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to import required Babel packages
      if (!babelCore) {
        babelCore = await import('@babel/core');
      }
      if (!babelPresetEnv) {
        babelPresetEnv = await import('@babel/preset-env');
      }
      if (!babelPresetReact) {
        babelPresetReact = await import('@babel/preset-react');
      }
      if (!babelPresetTypeScript) {
        babelPresetTypeScript = await import('@babel/preset-typescript');
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize Babel with configured presets and plugins
   * Maps to Babel ecosystem setup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const startTime = Date.now();

    try {
      // Import Babel dependencies
      if (!babelCore) {
        babelCore = await import('@babel/core');
      }
      if (!babelPresetEnv) {
        babelPresetEnv = await import('@babel/preset-env');
      }
      if (!babelPresetReact) {
        babelPresetReact = await import('@babel/preset-react');
      }
      if (!babelPresetTypeScript) {
        babelPresetTypeScript = await import('@babel/preset-typescript');
      }

      // Validate configuration
      await this.validateConfiguration();

      this.metrics.initializationTime = Date.now() - startTime;
      this.isInitialized = true;

    } catch (error) {
      throw this.createProviderError(
        'BABEL_INITIALIZATION_FAILED',
        `Babel initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true,
        'Install required Babel packages: @babel/core, @babel/preset-env, @babel/preset-react, @babel/preset-typescript'
      );
    }
  }

  /**
   * Get Babel configuration for a framework
   */
  getBabelConfig(framework: ArtifactFramework): BabelConfig {
    return this.buildBabelConfig({
      code: '',
      framework,
      language: 'typescript',
      options: {}
    });
  }

  /**
   * Transform code using Babel
   */
  async transformWithBabel(code: string, config: BabelConfig): Promise<BabelResult> {
    if (!this.isInitialized || !babelCore) {
      throw this.createProviderError(
        'PROVIDER_NOT_INITIALIZED',
        'Babel provider not initialized',
        true
      );
    }

    const result = await babelCore.transformAsync(code, {
      presets: config.presets,
      plugins: config.plugins,
      parserOpts: config.parserOpts,
      generatorOpts: config.generatorOpts,
      sourceMaps: config.sourceMaps
    });

    return {
      code: result?.code || '',
      map: result?.map,
      ast: result?.ast
    };
  }

  /**
   * Transpile code using Babel
   * Maps to universal JavaScript/TypeScript transpilation
   */
  async transpile(request: TranspilationRequest, _config: FrameworkConfig): Promise<ProviderResult> {
    if (!this.isInitialized || !babelCore) {
      throw this.createProviderError(
        'PROVIDER_NOT_INITIALIZED',
        'Babel provider not initialized',
        true,
        'Call initialize() before transpiling'
      );
    }

    const startTime = Date.now();
    this.metrics.totalAttempts++;

    try {
      // Build Babel configuration for this request
      const babelConfig = this.buildBabelConfig(request);

      // Execute Babel transformation
      const result = await babelCore.transformAsync(request.code, babelConfig);

      if (!result || !result.code) {
        throw new Error('Babel transformation produced no output');
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(duration, babelConfig, true);

      return {
        code: result.code,
        map: result.map ? JSON.stringify(result.map) : undefined,
        warnings: [],
        metadata: {
          startTime,
          endTime: Date.now(),
          duration,
          providerSpecific: {
            provider: 'babel',
            framework: request.framework,
            babelVersion: this.getBabelVersion(),
            presets: babelConfig.presets?.map((p: any) => Array.isArray(p) ? p[0] : p) || [],
            plugins: babelConfig.plugins?.map((p: any) => Array.isArray(p) ? p[0] : p) || []
          }
        },
        success: true
      };

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, {}, false);

      if (error instanceof Error) {
        throw this.createProviderError(
          'TRANSPILATION_FAILED',
          `Babel transpilation failed: ${error.message}`,
          this.isRecoverableError(error),
          this.getSuggestionForError(error)
        );
      }

      throw this.createProviderError(
        'UNKNOWN_ERROR',
        'Unknown error during Babel transpilation',
        false,
        'Check code syntax and Babel configuration'
      );
    }
  }


  /**
   * Configure Babel with custom presets and plugins
   * Maps to dynamic Babel configuration
   */
  async configureBabel(config: BabelConfig): Promise<void> {
    this.config = { ...this.config, ...config };

    // Re-validate configuration
    if (this.isInitialized) {
      await this.validateConfiguration();
    }
  }

  /**
   * Get Babel execution metrics
   * Maps to performance monitoring
   */
  getBabelMetrics(): BabelMetrics {

    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.totalAttempts > 0 ?
        this.metrics.totalExecutionTime / this.metrics.totalAttempts : 0,
      successRate: this.metrics.totalAttempts > 0 ?
        this.metrics.successfulTranspilations / this.metrics.totalAttempts : 1.0
    };
  }

  /**
   * Cleanup provider resources
   * Maps to proper resource management
   */
  async dispose(): Promise<void> {
    this.isInitialized = false;

    // Clear Babel module references to allow garbage collection
    babelCore = null;
    babelPresetEnv = null;
    babelPresetReact = null;
    babelPresetTypeScript = null;

    // Reset metrics
    this.metrics = this.initializeMetrics();
  }

  // Private helper methods

  private buildBabelConfig(request: TranspilationRequest): any {
    const config: any = {
      filename: request.filename || this.generateFilename(request),
      presets: [...this.config.presets],
      plugins: [...this.config.plugins],
      sourceMaps: this.config.sourceMaps
    };

    // Framework-specific configuration
    this.configureForFramework(config, request.framework);

    // Language-specific configuration
    this.configureForLanguage(config, request);

    // Apply user-specified options
    if (request.options) {
      this.applyUserOptions(config, request.options);
    }

    return config;
  }

  private configureForFramework(config: any, framework: ArtifactFramework): void {
    switch (framework) {
      case 'react':
        // React preset should already be included
        const reactPresetIndex = config.presets.findIndex((preset: any) =>
          (Array.isArray(preset) && preset[0].includes('preset-react')) ||
          (typeof preset === 'string' && preset.includes('preset-react'))
        );
        if (reactPresetIndex !== -1) {
          config.presets[reactPresetIndex] = [
            '@babel/preset-react',
            { runtime: 'automatic', development: false }
          ];
        }
        break;

      case 'vue':
        // Add Vue-specific plugins if available
        config.plugins.push('@babel/plugin-syntax-jsx');
        break;

      case 'svelte':
        // Svelte-specific configuration
        break;

      case 'solid':
        // Solid.js specific JSX handling
        const reactIndex = config.presets.findIndex((preset: any) =>
          preset.includes && preset.includes('preset-react')
        );
        if (reactIndex !== -1) {
          config.presets[reactIndex] = [
            '@babel/preset-react',
            { runtime: 'automatic', importSource: 'solid-js/web' }
          ];
        }
        break;
    }
  }

  private configureForLanguage(config: any, request: TranspilationRequest): void {
    const isTypeScript = this.isTypeScriptCode(request);

    if (isTypeScript) {
      // Ensure TypeScript preset is properly configured
      const tsPresetIndex = config.presets.findIndex((preset: any) =>
        (Array.isArray(preset) && preset[0].includes('preset-typescript')) ||
        (typeof preset === 'string' && preset.includes('preset-typescript'))
      );

      if (tsPresetIndex !== -1) {
        config.presets[tsPresetIndex] = [
          '@babel/preset-typescript',
          {
            allowDeclareFields: true,
            allowNamespaces: true,
            isTSX: this.hasJSXContent(request.code)
          }
        ];
      }
    }
  }

  private applyUserOptions(config: any, options: any): void {
    if (options.minify) {
      config.minify = true;
      config.compact = true;
    }

    if (options.target) {
      // Update env preset target
      const envPresetIndex = config.presets.findIndex((preset: any) =>
        (Array.isArray(preset) && preset[0].includes('preset-env')) ||
        (typeof preset === 'string' && preset.includes('preset-env'))
      );

      if (envPresetIndex !== -1) {
        config.presets[envPresetIndex] = [
          '@babel/preset-env',
          { modules: false, targets: { [options.target]: true } }
        ];
      }
    }

    if (options.jsxFactory) {
      // Update React preset for custom JSX factory
      const reactPresetIndex = config.presets.findIndex((preset: any) =>
        preset.includes && preset.includes('preset-react')
      );

      if (reactPresetIndex !== -1) {
        config.presets[reactPresetIndex] = [
          '@babel/preset-react',
          { runtime: 'classic', pragma: options.jsxFactory }
        ];
      }
    }
  }

  private generateFilename(request: TranspilationRequest): string {
    if (this.isTypeScriptCode(request)) {
      return this.hasJSXContent(request.code) ? 'input.tsx' : 'input.ts';
    }
    return this.hasJSXContent(request.code) ? 'input.jsx' : 'input.js';
  }

  private isTypeScriptCode(request: TranspilationRequest): boolean {
    if (request.filename && /\.tsx?$/.test(request.filename)) {
      return true;
    }

    // Check content for TypeScript patterns
    const tsPatterns = [
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /enum\s+\w+/,
      /:\s*\w+(\[\]|<.*>)?/,
      /as\s+\w+/,
      /import\s+type/
    ];

    return tsPatterns.some(pattern => pattern.test(request.code));
  }

  private hasJSXContent(code: string): boolean {
    return /<[A-Za-z][A-Za-z0-9]*/.test(code);
  }

  private async validateConfiguration(): Promise<void> {
    // Basic validation of Babel configuration
    if (!this.config.presets || this.config.presets.length === 0) {
      throw new Error('At least one Babel preset is required');
    }

    // Test configuration with a simple piece of code
    try {
      await babelCore.transformAsync('const test = 1;', {
        presets: this.config.presets,
        plugins: this.config.plugins
      });
    } catch (error) {
      throw new Error(`Babel configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getBabelVersion(): string | undefined {
    try {
      return babelCore?.version || '7.23.0'; // fallback version
    } catch {
      return undefined;
    }
  }

  private isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [
      /syntax error/i,
      /unexpected token/i,
      /missing plugin/i,
      /unknown option/i,
      /preset.*not found/i
    ];

    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }

  private getSuggestionForError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('syntax error') || message.includes('unexpected token')) {
      return 'Check code syntax - may contain unsupported language features';
    }
    if (message.includes('missing plugin')) {
      return 'Install required Babel plugin or update configuration';
    }
    if (message.includes('preset') && message.includes('not found')) {
      return 'Install missing Babel preset or check configuration';
    }
    if (message.includes('unknown option')) {
      return 'Check Babel configuration options for typos or deprecated settings';
    }

    return 'Check code syntax and Babel preset/plugin configuration';
  }

  private updateMetrics(duration: number, config: any, success: boolean): void {
    this.metrics.totalExecutionTime += duration;

    if (success) {
      this.metrics.successfulTranspilations++;
      this.metrics.fastestExecution = Math.min(this.metrics.fastestExecution, duration);

      // Update preset usage
      if (config.presets) {
        for (const preset of config.presets) {
          const presetName = Array.isArray(preset) ? preset[0] : preset;
          this.metrics.presetUsage[presetName] = (this.metrics.presetUsage[presetName] || 0) + 1;
        }
      }

      // Update plugin usage
      if (config.plugins) {
        for (const plugin of config.plugins) {
          const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
          this.metrics.pluginUsage[pluginName] = (this.metrics.pluginUsage[pluginName] || 0) + 1;
        }
      }
    } else {
      this.metrics.failedTranspilations++;
    }

    this.metrics.slowestExecution = Math.max(this.metrics.slowestExecution, duration);
  }

  private initializeMetrics(): BabelMetrics {
    return {
      totalAttempts: 0,
      successfulTranspilations: 0,
      failedTranspilations: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      fastestExecution: Infinity,
      slowestExecution: 0,
      successRate: 1.0,
      pluginUsage: {},
      presetUsage: {},
      isInitialized: false,
      initializationTime: 0
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxCodeSize: 10 * 1024 * 1024, // 10MB
      supportedFrameworks: ['react', 'vue', 'svelte', 'solid'],
      supportsSourceMaps: true,
      supportsIncremental: false,
      performance: {
        expectedDuration: 850,
        maxDuration: 5000,
        expectedMemoryUsage: 100 * 1024 * 1024, // 100MB
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB
        initializationTime: 200
      },
      limitations: [
        'Highest execution time compared to other providers',
        'Higher memory usage due to AST processing',
        'Requires extensive plugin ecosystem for full features'
      ]
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    const totalAttempts = this.metrics.totalAttempts;
    const successCount = this.metrics.successfulTranspilations;
    const successRate = totalAttempts > 0 ? successCount / totalAttempts : 1.0;
    const avgDuration = totalAttempts > 0 ? this.metrics.totalExecutionTime / totalAttempts : 0;

    return {
      status: this.isInitialized ? (successRate > 0.8 ? 'healthy' : 'degraded') : 'unhealthy',
      successRate,
      averageDuration: avgDuration,
      resourceUsage: {
        memoryUsage: 0
      }
    };
  }

  private createProviderError(
    code: string,
    message: string,
    recoverable: boolean,
    _suggestion?: string
  ): ProviderError {
    const error = new Error(message) as ProviderError;
    error.code = code;
    error.category = 'transpilation';
    error.recoverable = recoverable;
    error.providerData = {
      isInitialized: this.isInitialized,
      configuredPresets: this.config.presets?.length || 0,
      configuredPlugins: this.config.plugins?.length || 0,
      babelVersion: this.getBabelVersion()
    };
    return error;
  }
}