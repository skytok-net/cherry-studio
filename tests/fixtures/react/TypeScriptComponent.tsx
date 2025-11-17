/**
 * TypeScript React Component Test Fixture
 * Tests TypeScript + JSX transpilation
 */

import React, { useState, useEffect } from 'react';

interface ComponentProps {
  title: string;
  count?: number;
  onUpdate?: (value: number) => void;
}

const TypeScriptComponent: React.FC<ComponentProps> = ({
  title,
  count = 0,
  onUpdate
}) => {
  const [localCount, setLocalCount] = useState<number>(count);

  useEffect(() => {
    if (onUpdate) {
      onUpdate(localCount);
    }
  }, [localCount, onUpdate]);

  const handleIncrement = (): void => {
    setLocalCount(prev => prev + 1);
  };

  return (
    <div className="typescript-component">
      <h2>{title}</h2>
      <div className="counter">
        <span>Count: {localCount}</span>
        <button onClick={handleIncrement}>Increment</button>
      </div>
    </div>
  );
};

export default TypeScriptComponent;