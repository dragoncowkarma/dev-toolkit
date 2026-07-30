import React from 'react';
import './ToolErrorBoundary.css';

/**
 * Isolates rendering/chunk-load failures in the active tool so the rest of the
 * app shell (Sidebar, layout) stays usable.
 *
 * React only exposes error-boundary behavior (getDerivedStateFromError /
 * componentDidCatch) through class components — there is no hook equivalent —
 * so this is intentionally the one class component in the codebase.
 *
 * @param {object} props Component props.
 * @param {React.ReactNode} props.children Content to render and guard.
 * @param {string} [props.resetKey] Changing this value clears a prior error
 *   state, used to recover automatically when the active tool changes.
 * @returns {React.JSX.Element} Children, or a fallback UI when an error was caught.
 */
export default class ToolErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Log for local debugging only; the user-facing UI never shows raw error details.
    console.error('Tool failed to load or render:', error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="tool-error-boundary" role="alert">
          <h2 className="tool-error-boundary__title">This tool couldn&apos;t be loaded</h2>
          <p className="tool-error-boundary__description">
            Something went wrong while loading this tool. This can happen after a new
            deployment or a temporary network issue. Refreshing the page usually fixes it.
          </p>
          <button
            type="button"
            className="tool-error-boundary__refresh"
            onClick={this.handleRefresh}
          >
            Refresh page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
