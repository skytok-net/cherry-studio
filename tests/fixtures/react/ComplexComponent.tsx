/**
 * Complex React Component Test Fixture
 * Tests advanced TypeScript patterns, hooks, and complex JSX
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
};

interface ComplexComponentProps {
  users: User[];
  onUserSelect?: (user: User) => void;
  filterByRole?: User['role'];
}

const ComplexComponent: React.FC<ComplexComponentProps> = ({
  users,
  onUserSelect,
  filterByRole
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Complex memoized filtering logic
  const filteredUsers = useMemo(() => {
    return users
      .filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = !filterByRole || user.role === filterByRole;
        return matchesSearch && matchesRole;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, searchTerm, filterByRole]);

  const handleUserClick = useCallback((user: User) => {
    setSelectedUser(user);
    if (onUserSelect) {
      onUserSelect(user);
    }
  }, [onUserSelect]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedUser(null);
        setSearchTerm('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="complex-component">
      <header className="component-header">
        <h2>User Management</h2>
        <div className="search-controls">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button onClick={clearSearch} className="clear-search">
              Clear
            </button>
          )}
        </div>
      </header>

      <main className="user-list">
        {filteredUsers.length === 0 ? (
          <div className="empty-state">
            <p>No users found matching your criteria.</p>
          </div>
        ) : (
          filteredUsers.map(user => (
            <div
              key={user.id}
              className={`user-card ${selectedUser?.id === user.id ? 'selected' : ''}`}
              onClick={() => handleUserClick(user)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleUserClick(user);
                }
              }}
            >
              <div className="user-info">
                <h3>{user.name}</h3>
                <p className="user-email">{user.email}</p>
                <span className={`user-role role-${user.role}`}>
                  {user.role.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </main>

      {selectedUser && (
        <aside className="user-details">
          <h3>Selected User</h3>
          <dl>
            <dt>Name:</dt>
            <dd>{selectedUser.name}</dd>
            <dt>Email:</dt>
            <dd>{selectedUser.email}</dd>
            <dt>Role:</dt>
            <dd>{selectedUser.role}</dd>
          </dl>
          <button onClick={() => setSelectedUser(null)}>Close</button>
        </aside>
      )}
    </div>
  );
};

export default ComplexComponent;