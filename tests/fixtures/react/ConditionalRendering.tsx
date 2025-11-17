/**
 * Conditional Rendering Test Fixture
 * Tests various conditional rendering patterns in React
 */

import React, { useState } from 'react';

interface ConditionalRenderingProps {
  showHeader?: boolean;
  userRole?: 'admin' | 'user' | 'guest';
}

const ConditionalRendering: React.FC<ConditionalRenderingProps> = ({
  showHeader = true,
  userRole = 'guest'
}) => {
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [items, setItems] = useState<string[]>(['Item 1', 'Item 2', 'Item 3']);

  const toggleVisibility = () => setIsVisible(!isVisible);

  return (
    <div className="conditional-rendering">
      {/* Simple conditional rendering */}
      {showHeader && (
        <header>
          <h1>Conditional Rendering Test</h1>
        </header>
      )}

      {/* Ternary operator */}
      <div className="visibility-toggle">
        <button onClick={toggleVisibility}>
          {isVisible ? 'Hide' : 'Show'} Content
        </button>
        {isVisible ? (
          <div className="visible-content">
            <p>This content is visible!</p>
          </div>
        ) : (
          <div className="hidden-content">
            <p>Content is hidden</p>
          </div>
        )}
      </div>

      {/* Multiple conditions */}
      <div className="user-role-section">
        {userRole === 'admin' && (
          <div className="admin-panel">
            <h3>Admin Panel</h3>
            <button>Delete All</button>
            <button>Manage Users</button>
          </div>
        )}

        {userRole === 'user' && (
          <div className="user-panel">
            <h3>User Dashboard</h3>
            <button>Edit Profile</button>
          </div>
        )}

        {userRole === 'guest' && (
          <div className="guest-panel">
            <h3>Welcome Guest</h3>
            <button>Sign Up</button>
            <button>Login</button>
          </div>
        )}
      </div>

      {/* List rendering with conditions */}
      <div className="items-list">
        <h3>Items ({items.length})</h3>
        {items.length === 0 ? (
          <p>No items found</p>
        ) : (
          <ul>
            {items.map((item, index) => (
              <li key={index}>
                {item}
                {index === 0 && <span className="first-item"> (First)</span>}
                {index === items.length - 1 && <span className="last-item"> (Last)</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Complex conditional with logical operators */}
      {isVisible && items.length > 0 && userRole !== 'guest' && (
        <div className="complex-conditional">
          <p>This appears only when: visible AND has items AND not guest</p>
        </div>
      )}

      {/* Short-circuit evaluation */}
      {items.length > 2 && <p>You have more than 2 items!</p>}
      {!isVisible || <p>Content is currently visible</p>}
    </div>
  );
};

export default ConditionalRendering;