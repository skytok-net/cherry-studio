/**
 * Native Esbuild Provider Implementation
 * High-performance transpilation using native esbuild binary via IPC
 * Feature: 003-transpiler-service-rearchitecture
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  INativeEsbuildProvider,
  ProviderInfo,
  ProviderError,
  ProviderResult,
  ProviderCapabilities,
  ProviderHealthStatus,
  ExecutionOptions,
  ExecutionResult
} from './ITranspilationProvider';
import type {
  TranspilationRequest
} from '../transpilation/ITranspilationService';
import type { FrameworkConfig } from '../transpilation/IFrameworkHandler';
import type { IBinaryProvider } from '../transpilation/IBinaryProvider';

interface ProcessMetrics {
  successfulExecutions: number;
  failedExecutions: number;
  totalAttempts: number;
  successfulTranspilations: number;
  failedTranspilations: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  fastestExecution: number;
  slowestExecution: number;
  successRate: number;
  uptime: number;
  initializationTime: number;
  currentActiveProcesses: number;
}

export class NativeEsbuildProvider implements INativeEsbuildProvider {
  private binaryProvider: IBinaryProvider;
  private binaryPath: string | null = null;
  private isInitialized: boolean = false;
  private processPool: Map<string, ChildProcess> = new Map();
  private activeProcesses: number = 0;
  private metrics: ProcessMetrics;

  constructor(binaryProvider: IBinaryProvider) {
    this.binaryProvider = binaryProvider;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Get provider information and capabilities
   * Maps to native esbuild characteristics
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'Native Esbuild',
      executionMode: 'native',
      version: this.getBinaryVersion() || 'unknown',
      description: 'High-performance transpilation using native esbuild binary',
      priority: 1 // Highest priority for performance
    };
  }

  /**
   * Check if native esbuild is available on the system
   * Maps to FR-003: Cross-platform binary detection
   */
  async isAvailable(): Promise<boolean> {
    try {
      const detectedPath = await this.binaryProvider.detectBinary();
      if (!detectedPath) {
        return false;
      }

      // Verify binary permissions and execution capability
      const isValid = await this.binaryProvider.validatePermissions(detectedPath);
      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize native esbuild provider
   * Maps to FR-004: Proper binary bundling and execution
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Detect and validate binary
    this.binaryPath = await this.binaryProvider.detectBinary();
    if (!this.binaryPath) {
      throw this.createProviderError(
        'BINARY_NOT_FOUND',
        'Native esbuild binary not found',
        true,
        'Install esbuild package or check binary permissions'
      );
    }

    // Ensure binary is executable
    const hasPermissions = await this.binaryProvider.ensureExecutable(this.binaryPath);
    if (!hasPermissions) {
      throw this.createProviderError(
        'BINARY_NOT_EXECUTABLE',
        'esbuild binary is not executable',
        true,
        'Check file permissions or reinstall esbuild'
      );
    }

    // Verify binary works with a simple test
    await this.testBinaryExecution();

    this.isInitialized = true;
    this.metrics.initializationTime = Date.now();
  }

  /**
   * Transpile code using native esbuild binary
   * Maps to FR-001: High-performance transpilation (<100ms)
   */
  async transpile(request: TranspilationRequest, _config: FrameworkConfig): Promise<ProviderResult> {
    if (!this.isInitialized || !this.binaryPath) {
      throw this.createProviderError(
        'PROVIDER_NOT_INITIALIZED',
        'Native esbuild provider not initialized',
        true,
        'Call initialize() before transpiling'
      );
    }

    const startTime = Date.now();
    this.metrics.totalAttempts++;

    try {
      // Create temporary files for esbuild IPC
      const tempDir = await this.createTempDirectory();
      const inputFile = path.join(tempDir, this.generateInputFilename(request));
      const outputFile = path.join(tempDir, 'output.js');
      const mapFile = path.join(tempDir, 'output.js.map');

      try {
        // Write input code to temporary file
        await fs.writeFile(inputFile, request.code, 'utf8');

        // Configure esbuild options
        const esbuildOptions = this.buildEsbuildOptions(request, inputFile, outputFile);

        // Execute esbuild binary
        const executionResult = await this.executeBinaryInternal(esbuildOptions);

        // Read transpiled output
        const transpiledCode = await fs.readFile(outputFile, 'utf8');
        let sourceMap: string | undefined;

        // Read source map if generated
        try {
          sourceMap = await fs.readFile(mapFile, 'utf8');
        } catch {
          // Source map is optional
        }

        // Clean up temporary files
        await this.cleanupTempDirectory(tempDir);

        const duration = Date.now() - startTime;
        this.updateMetrics(duration, true);

        return {
          code: transpiledCode,
          map: sourceMap,
          warnings: [],
          metadata: {
            startTime,
            endTime: Date.now(),
            duration,
            providerSpecific: {
              provider: 'native-esbuild',
              framework: request.framework,
              binaryVersion: this.getBinaryVersion(),
              processId: executionResult.processId,
              exitCode: executionResult.exitCode,
              memoryUsage: executionResult.memoryUsage
            }
          },
          success: true
        };

      } catch (error) {
        // Ensure cleanup on error
        await this.cleanupTempDirectory(tempDir);
        throw error;
      }

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false);

      if (error instanceof Error) {
        throw this.createProviderError(
          'TRANSPILATION_FAILED',
          `Native esbuild transpilation failed: ${error.message}`,
          this.isRecoverableError(error),
          this.getSuggestionForError(error)
        );
      }

      throw this.createProviderError(
        'UNKNOWN_ERROR',
        'Unknown error during native esbuild transpilation',
        false,
        'Check esbuild installation and binary permissions'
      );
    }
  }

  /**
   * Execute esbuild binary with specific arguments
   * Maps to IPC communication requirements
   */
  async executeBinary(args: string[], execOptions: ExecutionOptions): Promise<ExecutionResult> {
    if (!this.isInitialized || !this.binaryPath) {
      throw this.createProviderError(
        'PROVIDER_NOT_INITIALIZED',
        'Native esbuild provider not initialized',
        true,
        'Call initialize() before executing binary'
      );
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      // Spawn esbuild process
      const childProcess = spawn(this.binaryPath!, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: execOptions.cwd || process.cwd(),
        env: { ...process.env, ...execOptions.env }
      });

      // Handle stdout
      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
          duration,
          success: code === 0
        });
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        reject(error);
      });

      // Set timeout if specified
      if (execOptions.timeout) {
        setTimeout(() => {
          childProcess.kill('SIGTERM');
          reject(new Error('esbuild process timed out'));
        }, execOptions.timeout);
      }

      // Write input if provided
      if (execOptions.input) {
        childProcess.stdin?.write(execOptions.input);
        childProcess.stdin?.end();
      }
    });
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxCodeSize: 50 * 1024 * 1024, // 50MB
      supportedFrameworks: ['react', 'vue', 'svelte', 'solid'],
      supportsSourceMaps: true,
      supportsIncremental: true,
      performance: {
        expectedDuration: 35,
        maxDuration: 1000,
        expectedMemoryUsage: 50 * 1024 * 1024, // 50MB
        maxMemoryUsage: 200 * 1024 * 1024, // 200MB
        initializationTime: 100
      },
      limitations: [
        'Requires native binary installation',
        'Platform-dependent executable',
        'May require specific OS permissions'
      ]
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    const totalAttempts = this.metrics.totalAttempts;
    const successCount = this.metrics.successfulTranspilations || 0;
    const successRate = totalAttempts > 0 ? successCount / totalAttempts : 1.0;
    const avgDuration = totalAttempts > 0 ? this.metrics.totalExecutionTime / totalAttempts : 0;

    return {
      status: this.isInitialized ? (successRate > 0.9 ? 'healthy' : 'degraded') : 'unhealthy',
      successRate,
      averageDuration: avgDuration,
      resourceUsage: {
        memoryUsage: 0
      }
    };
  }

  async getBinaryInfo(): Promise<any> {
    if (!this.binaryPath) {
      throw new Error('Binary not initialized');
    }
    return {
      path: this.binaryPath,
      version: this.getBinaryVersion() || 'unknown',
      size: 0,
      permissions: {} as any,
      lastModified: new Date()
    };
  }

  /**
   * Cleanup provider resources
   * Maps to proper resource management
   */
  async dispose(): Promise<void> {
    // Terminate any active processes
    for (const [processId, process] of this.processPool) {
      try {
        process.kill('SIGTERM');
        this.processPool.delete(processId);
      } catch (error) {
        // Process may already be terminated
      }
    }

    this.isInitialized = false;
    this.binaryPath = null;
    this.activeProcesses = 0;
  }

  // Private helper methods

  private async testBinaryExecution(): Promise<void> {
    if (!this.binaryPath) {
      throw new Error('Binary path not set');
    }

    const testCode = 'const test = 1;';
    const tempDir = await this.createTempDirectory();
    const inputFile = path.join(tempDir, 'test.js');
    const outputFile = path.join(tempDir, 'output.js');

    try {
      await fs.writeFile(inputFile, testCode, 'utf8');

      const options = [
        inputFile,
        '--outfile=' + outputFile,
        '--format=esm',
        '--target=es2018'
      ];

      await this.executeBinaryInternal(options);

      // Verify output was created
      const output = await fs.readFile(outputFile, 'utf8');
      if (!output.trim()) {
        throw new Error('Binary produced empty output');
      }

    } finally {
      await this.cleanupTempDirectory(tempDir);
    }
  }

  private async executeBinaryInternal(options: string[]): Promise<{
    processId: string;
    exitCode: number;
    memoryUsage?: number;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.binaryPath) {
        reject(new Error('Binary path not available'));
        return;
      }

      const processId = this.generateProcessId();
      const startTime = Date.now();
      let stderr = '';

      // Spawn esbuild process
      const childProcess = spawn(this.binaryPath, options, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env }
      });

      this.processPool.set(processId, childProcess);
      this.activeProcesses++;

      // Handle stderr for error reporting
      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code) => {
        this.processPool.delete(processId);
        this.activeProcesses--;

        if (code === 0) {
          resolve({
            processId,
            exitCode: code,
            memoryUsage: this.estimateMemoryUsage(Date.now() - startTime)
          });
        } else {
          reject(new Error(`esbuild exited with code ${code}: ${stderr.trim()}`));
        }
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        this.processPool.delete(processId);
        this.activeProcesses--;
        reject(error);
      });

      // Set timeout for process execution
      const timeout = setTimeout(() => {
        childProcess.kill('SIGTERM');
        this.processPool.delete(processId);
        this.activeProcesses--;
        reject(new Error('esbuild process timed out'));
      }, 30000); // 30 second timeout

      childProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  private buildEsbuildOptions(
    request: TranspilationRequest,
    inputFile: string,
    outputFile: string
  ): string[] {
    const options = [
      inputFile,
      '--outfile=' + outputFile,
      '--format=esm',
      '--target=es2018',
      '--sourcemap=external'
    ];

    // Framework-specific options
    if (request.framework === 'react') {
      options.push('--jsx=automatic');
    }

    // TypeScript support
    if (this.isTypeScriptFile(request.filename)) {
      options.push('--loader=tsx');
    } else if (this.isJSXFile(request.filename)) {
      options.push('--loader=jsx');
    }

    // Add user-specified options
    if (request.options) {
      if (request.options.minify) {
        options.push('--minify');
      }
      if (request.options.target) {
        options.push(`--target=${request.options.target}`);
      }
    }

    return options;
  }

  private generateInputFilename(request: TranspilationRequest): string {
    if (request.filename) {
      return path.basename(request.filename);
    }

    // Generate appropriate extension based on content
    if (this.hasJSXContent(request.code)) {
      return request.framework === 'react' ? 'input.tsx' : 'input.jsx';
    }

    return 'input.ts';
  }

  private async createTempDirectory(): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `esbuild-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private isTypeScriptFile(filename?: string): boolean {
    return filename ? /\.tsx?$/.test(filename) : false;
  }

  private isJSXFile(filename?: string): boolean {
    return filename ? filename.endsWith('.jsx') : false;
  }

  private hasJSXContent(code: string): boolean {
    return /<[A-Za-z][A-Za-z0-9]*/.test(code);
  }

  private generateProcessId(): string {
    return `pid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateMemoryUsage(executionTime: number): number {
    // Rough estimation based on execution time (in bytes)
    return Math.max(1024 * 1024, executionTime * 1000); // At least 1MB
  }

  private getBinaryVersion(): string | undefined {
    // Try to get version from binary provider if available
    try {
      // Version detection would require executing the binary
      // For now, return undefined
      return undefined;
    } catch {
      return undefined;
    }
  }

  private isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [
      /ENOENT/,
      /EACCES/,
      /EPERM/,
      /timeout/i,
      /spawn.*ENOTDIR/
    ];

    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }

  private getSuggestionForError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('enoent') || message.includes('not found')) {
      return 'Install esbuild package: npm install esbuild';
    }
    if (message.includes('eacces') || message.includes('eperm')) {
      return 'Check file permissions or run with appropriate privileges';
    }
    if (message.includes('enotdir')) {
      return 'Verify esbuild binary path and file system structure';
    }
    if (message.includes('timeout')) {
      return 'Code may be too complex for native processing, try WebAssembly fallback';
    }

    return 'Check esbuild installation and system configuration';
  }

  private updateMetrics(duration: number, success: boolean): void {
    this.metrics.totalExecutionTime += duration;

    if (success) {
      this.metrics.successfulExecutions++;
      this.metrics.fastestExecution = Math.min(this.metrics.fastestExecution, duration);
    } else {
      this.metrics.failedExecutions++;
    }

    this.metrics.slowestExecution = Math.max(this.metrics.slowestExecution, duration);
  }

  private initializeMetrics(): ProcessMetrics {
    return {
      successfulExecutions: 0,
      failedExecutions: 0,
      totalAttempts: 0,
      successfulTranspilations: 0,
      failedTranspilations: 0,
      totalExecutionTime: 0,
      averageExecutionTime: 0,
      fastestExecution: Infinity,
      slowestExecution: 0,
      successRate: 1.0,
      uptime: 0,
      initializationTime: 0,
      currentActiveProcesses: 0
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
      binaryPath: this.binaryPath,
      isInitialized: this.isInitialized,
      activeProcesses: this.activeProcesses
    };
    return error;
  }
}