import './LoadingSpinner.css';

/**
 * LoadingSpinner component renders a visual progress indicator.
 * Used as a fallback for React.Suspense when lazy loading tools.
 *
 * @returns {React.JSX.Element} A container with an animated spinner and loading text.
 */
export default function LoadingSpinner() {
  return (
    <div className="loading-container" role="status" aria-live="polite">
      <div className="loading-spinner" />
      <span className="loading-text">Loading tool...</span>
    </div>
  );
}
