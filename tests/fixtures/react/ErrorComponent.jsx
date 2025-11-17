/**
 * Error Component Test Fixture
 * Tests error boundary patterns and error handling in React
 */

import React, { Component, useState } from 'react';

// Error Boundary Class Component
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong!</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.message}</pre>
          </details>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component that can throw errors
function ProblematicComponent({ shouldThrow = false }) {
  const [count, setCount] = useState(0);

  if (shouldThrow && count > 3) {
    throw new Error('Count exceeded maximum value!');
  }

  return (
    <div className="problematic-component">
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment (throws error after 3)
      </button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}

// Main Error Component
function ErrorComponent() {
  const [enableErrors, setEnableErrors] = useState(false);

  return (
    <div className="error-component">
      <h1>Error Handling Test</h1>

      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={enableErrors}
            onChange={(e) => setEnableErrors(e.target.checked)}
          />
          Enable error throwing
        </label>
      </div>

      <ErrorBoundary>
        <ProblematicComponent shouldThrow={enableErrors} />
      </ErrorBoundary>

      <div className="info">
        <p>This component tests error boundaries and error handling.</p>
        <p>Check the checkbox and click increment more than 3 times to trigger an error.</p>
      </div>
    </div>
  );
}

export default ErrorComponent;