/**
 * Class Component Test Fixture
 * Tests transpilation of React class components with lifecycle methods
 */

import React, { Component } from 'react';

class ClassComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      count: 0,
      mounted: false
    };

    this.handleIncrement = this.handleIncrement.bind(this);
    this.handleDecrement = this.handleDecrement.bind(this);
  }

  componentDidMount() {
    this.setState({ mounted: true });
    console.log('Component mounted');
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.count !== this.state.count) {
      console.log(`Count changed from ${prevState.count} to ${this.state.count}`);
    }
  }

  componentWillUnmount() {
    console.log('Component will unmount');
  }

  handleIncrement() {
    this.setState(prevState => ({
      count: prevState.count + 1
    }));
  }

  handleDecrement() {
    this.setState(prevState => ({
      count: prevState.count - 1
    }));
  }

  render() {
    const { count, mounted } = this.state;
    const { title = 'Class Component' } = this.props;

    if (!mounted) {
      return <div>Loading...</div>;
    }

    return (
      <div className="class-component">
        <h2>{title}</h2>
        <div className="counter">
          <p>Count: {count}</p>
          <button onClick={this.handleIncrement}>+</button>
          <button onClick={this.handleDecrement}>-</button>
        </div>
      </div>
    );
  }
}

export default ClassComponent;