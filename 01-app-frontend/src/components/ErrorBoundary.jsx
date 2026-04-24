import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[CovA ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠️</div>
          <h2 className="error-boundary-title">Component Error</h2>
          <p className="error-boundary-message">
            {this.state.error?.message || 'An unexpected error occurred in this component.'}
          </p>
          <button className="error-boundary-retry" onClick={this.handleRetry}>
            Retry Component
          </button>
          {this.props.showDetails && this.state.errorInfo && (
            <details className="error-boundary-details">
              <summary>Technical Details</summary>
              <pre>{this.state.errorInfo.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
