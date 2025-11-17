/**
 * Simple React Component Test Fixture
 * Tests basic JSX transpilation without TypeScript
 */

import React from 'react';

function SimpleComponent() {
  return (
    <div className="simple-component">
      <h1>Hello, World!</h1>
      <p>This is a simple React component.</p>
    </div>
  );
}

export default SimpleComponent;