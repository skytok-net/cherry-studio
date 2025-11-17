/**
 * React Fragment Test Fixture
 * Tests transpilation of React Fragments and short syntax
 */

import React from 'react';

function FragmentTest() {
  return (
    <React.Fragment>
      <h1>Fragment Test</h1>
      <p>This component uses React.Fragment.</p>

      {/* Short fragment syntax */}
      <>
        <div>Short fragment syntax</div>
        <div>Multiple elements in fragment</div>
      </>

      {/* Fragment with key */}
      <React.Fragment key="keyed-fragment">
        <span>Fragment with key</span>
      </React.Fragment>
    </React.Fragment>
  );
}

export default FragmentTest;