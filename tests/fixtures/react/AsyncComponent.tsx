/**
 * Async Component Test Fixture
 * Tests async patterns, suspense, and data fetching in React
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';

// Mock async data fetcher
const fetchUserData = async (userId: number): Promise<{ id: number; name: string; email: string }> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (userId === 999) {
        reject(new Error('User not found'));
        return;
      }
      resolve({
        id: userId,
        name: `User ${userId}`,
        email: `user${userId}@example.com`
      });
    }, Math.random() * 2000 + 500); // 500-2500ms delay
  });
};

// Lazy loaded component
const LazyLoadedComponent = lazy(() =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve({
        default: () => (
          <div className="lazy-component">
            <h3>Lazy Loaded Component</h3>
            <p>This component was loaded asynchronously!</p>
          </div>
        )
      } as any);
    }, 1000);
  })
);

interface User {
  id: number;
  name: string;
  email: string;
}

const AsyncComponent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<number>(1);
  const [showLazy, setShowLazy] = useState<boolean>(false);

  const loadUser = async (id: number) => {
    setLoading(true);
    setError(null);
    setUser(null);

    try {
      const userData = await fetchUserData(id);
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser(userId);
  }, [userId]);

  const handleUserIdChange = (newId: number) => {
    setUserId(newId);
  };

  return (
    <div className="async-component">
      <h1>Async Component Test</h1>

      <div className="user-controls">
        <label>
          User ID:
          <input
            type="number"
            value={userId}
            onChange={(e) => handleUserIdChange(parseInt(e.target.value) || 1)}
            min="1"
            max="1000"
          />
        </label>
        <button onClick={() => loadUser(userId)}>Reload User</button>
        <button onClick={() => handleUserIdChange(999)}>Test Error (999)</button>
      </div>

      <div className="user-data">
        {loading && (
          <div className="loading">
            <p>Loading user data...</p>
            <div className="spinner">🔄</div>
          </div>
        )}

        {error && (
          <div className="error">
            <h3>Error:</h3>
            <p>{error}</p>
            <button onClick={() => loadUser(userId)}>Retry</button>
          </div>
        )}

        {user && !loading && (
          <div className="user-info">
            <h3>User Information</h3>
            <dl>
              <dt>ID:</dt>
              <dd>{user.id}</dd>
              <dt>Name:</dt>
              <dd>{user.name}</dd>
              <dt>Email:</dt>
              <dd>{user.email}</dd>
            </dl>
          </div>
        )}
      </div>

      <div className="lazy-loading-section">
        <h2>Lazy Loading Test</h2>
        <button onClick={() => setShowLazy(!showLazy)}>
          {showLazy ? 'Hide' : 'Show'} Lazy Component
        </button>

        {showLazy && (
          <Suspense fallback={<div className="suspense-fallback">Loading lazy component...</div>}>
            <LazyLoadedComponent />
          </Suspense>
        )}
      </div>

      <div className="async-operations">
        <h2>Parallel Async Operations</h2>
        <AsyncOperationsList />
      </div>
    </div>
  );
};

// Component demonstrating parallel async operations
const AsyncOperationsList: React.FC = () => {
  const [results, setResults] = useState<Array<{ id: number; result?: any; error?: string; loading: boolean }>>([]);

  const startParallelOperations = async () => {
    const operations = [1, 2, 3, 4, 5].map(id => ({ id, loading: true }));
    setResults(operations);

    const promises = operations.map(async (op) => {
      try {
        const result = await fetchUserData(op.id);
        return { ...op, result, loading: false };
      } catch (error) {
        return { ...op, error: error instanceof Error ? error.message : 'Unknown error', loading: false };
      }
    });

    const settledResults = await Promise.allSettled(promises);
    const finalResults = settledResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return { id: index + 1, error: result.reason?.message || 'Failed', loading: false };
      }
    });

    setResults(finalResults);
  };

  return (
    <div className="async-operations-list">
      <button onClick={startParallelOperations}>Start Parallel Operations</button>

      {results.length > 0 && (
        <div className="operations-results">
          {results.map((result) => (
            <div key={result.id} className={`operation-result ${result.loading ? 'loading' : result.error ? 'error' : 'success'}`}>
              <h4>Operation {result.id}</h4>
              {result.loading && <p>Loading...</p>}
              {result.error && <p className="error">Error: {result.error}</p>}
              {result.result && (
                <p className="success">✅ {result.result.name} - {result.result.email}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AsyncComponent;