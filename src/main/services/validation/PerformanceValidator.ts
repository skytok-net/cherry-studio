/**
 * Performance Validator for Transpilation Service
 * Validates that transpilation meets performance requirements
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  TranspilationRequest,
  TranspilationResult,
  ExecutionMode,
  ArtifactFramework
} from '../transpilation/ITranspilationService';

export interface PerformanceThresholds {
  native: number;      // Native esbuild target (ms)
  wasm: number;        // WebAssembly target (ms)
  babel: number;       // Babel target (ms)
}

export interface PerformanceTestResult {
  passed: boolean;
  executionMode: ExecutionMode;
  actualTime: number;
  targetTime: number;
  framework: ArtifactFramework;
  codeSize: number;
  suggestion?: string;
  metadata: {
    filename?: string;
    provider: string;
    timestamp: Date;
    memoryUsage?: number;
    cacheHit: boolean;
  };
}

export interface PerformanceBenchmark {
  framework: ArtifactFramework;
  testName: string;
  codeSize: number;
  complexity: 'simple' | 'medium' | 'complex';
  results: PerformanceTestResult[];
  averageTime: number;
  fastestTime: number;
  slowestTime: number;
  passRate: number;
}

export class PerformanceValidator {
  private static readonly DEFAULT_THRESHOLDS: PerformanceThresholds = {
    native: 100,   // 100ms for native esbuild
    wasm: 500,     // 500ms for WebAssembly
    babel: 2000    // 2000ms for Babel
  };

  private static readonly COMPLEXITY_MULTIPLIERS = {
    simple: 1.0,
    medium: 1.5,
    complex: 2.0
  };

  private thresholds: PerformanceThresholds;
  private benchmarks: Map<string, PerformanceBenchmark> = new Map();

  constructor(customThresholds?: Partial<PerformanceThresholds>) {
    this.thresholds = {
      ...PerformanceValidator.DEFAULT_THRESHOLDS,
      ...customThresholds
    };
  }

  /**
   * Validate performance of a transpilation result
   * Maps to FR-001: Performance requirements validation
   */
  validatePerformance(
    request: TranspilationRequest,
    result: TranspilationResult,
    complexity: 'simple' | 'medium' | 'complex' = 'medium'
  ): PerformanceTestResult {
    const targetTime = this.getTargetTime(result.executionMode, complexity);
    const actualTime = result.duration || 0;
    const passed = actualTime <= targetTime;

    const testResult: PerformanceTestResult = {
      passed,
      executionMode: result.executionMode || 'unknown',
      actualTime,
      targetTime,
      framework: request.framework,
      codeSize: request.code.length,
      metadata: {
        filename: request.filename,
        provider: result.executionMode || 'unknown',
        timestamp: new Date(),
        memoryUsage: result.memoryUsage,
        cacheHit: result.cacheHit || false
      }
    };

    // Add suggestions for failed tests
    if (!passed) {
      testResult.suggestion = this.generatePerformanceSuggestion(result.executionMode, actualTime, targetTime);
    }

    return testResult;
  }

  /**
   * Run comprehensive performance benchmark
   * Maps to performance testing requirements
   */
  async runBenchmark(
    testName: string,
    request: TranspilationRequest,
    transpileFunction: (req: TranspilationRequest) => Promise<TranspilationResult>,
    iterations: number = 5,
    complexity: 'simple' | 'medium' | 'complex' = 'medium'
  ): Promise<PerformanceBenchmark> {
    const results: PerformanceTestResult[] = [];

    for (let i = 0; i < iterations; i++) {
      const result = await transpileFunction(request);
      const performanceResult = this.validatePerformance(request, result, complexity);
      results.push(performanceResult);
    }

    const times = results.map(r => r.actualTime);
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const fastestTime = Math.min(...times);
    const slowestTime = Math.max(...times);
    const passCount = results.filter(r => r.passed).length;
    const passRate = passCount / results.length;

    const benchmark: PerformanceBenchmark = {
      framework: request.framework,
      testName,
      codeSize: request.code.length,
      complexity,
      results,
      averageTime,
      fastestTime,
      slowestTime,
      passRate
    };

    this.benchmarks.set(testName, benchmark);
    return benchmark;
  }

  /**
   * Validate performance across multiple providers
   * Maps to fallback chain performance validation
   */
  async validateFallbackChainPerformance(
    request: TranspilationRequest,
    results: TranspilationResult[],
    complexity: 'simple' | 'medium' | 'complex' = 'medium'
  ): Promise<{
    allPassed: boolean;
    results: PerformanceTestResult[];
    degradationAcceptable: boolean;
    suggestions: string[];
  }> {
    const performanceResults = results.map(result =>
      this.validatePerformance(request, result, complexity)
    );

    const allPassed = performanceResults.every(result => result.passed);
    const suggestions: string[] = [];

    // Check for acceptable performance degradation in fallback chain
    const degradationAcceptable = this.validateDegradationPattern(performanceResults);

    if (!degradationAcceptable) {
      suggestions.push('Fallback chain shows unexpected performance characteristics');
    }

    // Check for cache effectiveness
    const cacheHits = performanceResults.filter(r => r.metadata.cacheHit);
    if (cacheHits.length === 0 && results.length > 1) {
      suggestions.push('No cache hits detected - verify caching is working correctly');
    }

    return {
      allPassed,
      results: performanceResults,
      degradationAcceptable,
      suggestions
    };
  }

  /**
   * Get performance statistics for a framework
   * Maps to performance monitoring and reporting
   */
  getFrameworkPerformanceStats(framework: ArtifactFramework): {
    totalTests: number;
    averagePassRate: number;
    averageTime: number;
    bestTime: number;
    worstTime: number;
    providerBreakdown: Record<ExecutionMode, { count: number; averageTime: number; passRate: number }>;
  } {
    const frameworkBenchmarks = Array.from(this.benchmarks.values())
      .filter(b => b.framework === framework);

    if (frameworkBenchmarks.length === 0) {
      return {
        totalTests: 0,
        averagePassRate: 0,
        averageTime: 0,
        bestTime: 0,
        worstTime: 0,
        providerBreakdown: {} as any
      };
    }

    const allResults = frameworkBenchmarks.flatMap(b => b.results);
    const totalTests = allResults.length;
    const averagePassRate = allResults.filter(r => r.passed).length / totalTests;
    const times = allResults.map(r => r.actualTime);
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const bestTime = Math.min(...times);
    const worstTime = Math.max(...times);

    // Provider breakdown
    const providerBreakdown: Record<ExecutionMode, { count: number; averageTime: number; passRate: number }> = {} as any;

    const providers = [...new Set(allResults.map(r => r.executionMode))];
    for (const provider of providers) {
      const providerResults = allResults.filter(r => r.executionMode === provider);
      const providerTimes = providerResults.map(r => r.actualTime);

      providerBreakdown[provider] = {
        count: providerResults.length,
        averageTime: providerTimes.reduce((sum, time) => sum + time, 0) / providerTimes.length,
        passRate: providerResults.filter(r => r.passed).length / providerResults.length
      };
    }

    return {
      totalTests,
      averagePassRate,
      averageTime,
      bestTime,
      worstTime,
      providerBreakdown
    };
  }

  /**
   * Generate performance report
   * Maps to performance monitoring and debugging
   */
  generatePerformanceReport(): {
    summary: {
      totalBenchmarks: number;
      overallPassRate: number;
      averageTime: number;
      thresholds: PerformanceThresholds;
    };
    frameworkStats: Record<ArtifactFramework, ReturnType<PerformanceValidator['getFrameworkPerformanceStats']>>;
    recommendations: string[];
    problematicTests: PerformanceBenchmark[];
  } {
    const allBenchmarks = Array.from(this.benchmarks.values());
    const allResults = allBenchmarks.flatMap(b => b.results);

    const summary = {
      totalBenchmarks: allBenchmarks.length,
      overallPassRate: allResults.filter(r => r.passed).length / Math.max(1, allResults.length),
      averageTime: allResults.reduce((sum, r) => sum + r.actualTime, 0) / Math.max(1, allResults.length),
      thresholds: this.thresholds
    };

    const frameworks: ArtifactFramework[] = ['react', 'vue', 'svelte', 'solid'];
    const frameworkStats: Record<ArtifactFramework, ReturnType<typeof this.getFrameworkPerformanceStats>> = {} as any;

    for (const framework of frameworks) {
      frameworkStats[framework] = this.getFrameworkPerformanceStats(framework);
    }

    const recommendations = this.generateRecommendations(allBenchmarks);
    const problematicTests = allBenchmarks.filter(b => b.passRate < 0.8);

    return {
      summary,
      frameworkStats,
      recommendations,
      problematicTests
    };
  }

  // Private helper methods

  private getTargetTime(executionMode: ExecutionMode, complexity: 'simple' | 'medium' | 'complex'): number {
    const baseTime = this.thresholds[executionMode as keyof PerformanceThresholds] || this.thresholds.babel;
    const multiplier = PerformanceValidator.COMPLEXITY_MULTIPLIERS[complexity];
    return Math.round(baseTime * multiplier);
  }

  private generatePerformanceSuggestion(
    executionMode: ExecutionMode,
    actualTime: number,
    targetTime: number
  ): string {
    const slowdownFactor = actualTime / targetTime;

    if (executionMode === 'native') {
      if (slowdownFactor > 3) {
        return 'Native esbuild severely underperforming - check binary installation and permissions';
      }
      return 'Native esbuild slower than expected - consider code complexity or system load';
    }

    if (executionMode === 'webassembly') {
      if (slowdownFactor > 2) {
        return 'WebAssembly esbuild slow - consider falling back to Babel for complex code';
      }
      return 'WebAssembly performance acceptable but could be optimized';
    }

    if (executionMode === 'babel') {
      if (slowdownFactor > 1.5) {
        return 'Babel transpilation slow - consider preset optimization or code splitting';
      }
      return 'Babel performance within acceptable range';
    }

    return 'Performance below target - investigate provider configuration';
  }

  private validateDegradationPattern(results: PerformanceTestResult[]): boolean {
    // Sort by expected performance order: native < wasm < babel
    const expectedOrder: ExecutionMode[] = ['native', 'webassembly', 'babel'];
    const orderedResults = results.sort((a, b) => {
      const indexA = expectedOrder.indexOf(a.executionMode);
      const indexB = expectedOrder.indexOf(b.executionMode);
      return indexA - indexB;
    });

    // Check that each subsequent provider is slower (allowing for some variance)
    for (let i = 1; i < orderedResults.length; i++) {
      const current = orderedResults[i];
      const previous = orderedResults[i - 1];

      // Allow 20% variance for acceptable degradation
      if (current.actualTime < previous.actualTime * 0.8) {
        return false; // Unexpected performance improvement suggests measurement error
      }
    }

    return true;
  }

  private generateRecommendations(benchmarks: PerformanceBenchmark[]): string[] {
    const recommendations: string[] = [];

    const lowPassRateBenchmarks = benchmarks.filter(b => b.passRate < 0.8);
    if (lowPassRateBenchmarks.length > 0) {
      recommendations.push(
        `${lowPassRateBenchmarks.length} benchmarks have low pass rates (<80%) - investigate performance bottlenecks`
      );
    }

    const slowAverages = benchmarks.filter(b => b.averageTime > this.thresholds.babel);
    if (slowAverages.length > 0) {
      recommendations.push('Some benchmarks exceed even Babel thresholds - review code complexity or system resources');
    }

    const highVariance = benchmarks.filter(b => (b.slowestTime - b.fastestTime) > b.averageTime);
    if (highVariance.length > 0) {
      recommendations.push('High performance variance detected - investigate system load or caching inconsistencies');
    }

    return recommendations;
  }
}