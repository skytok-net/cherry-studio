/**
 * JSX Without React Import Test Fixture
 * Tests automatic React import injection during preprocessing
 */

function WithoutReactImport() {
  return (
    <div className="no-import-component">
      <h1>JSX without explicit React import</h1>
      <p>This should trigger automatic React import injection.</p>
      <button onClick={() => console.log('Clicked!')}>
        Click me
      </button>
    </div>
  );
}

export default WithoutReactImport;