import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import LoadingSpinner from './LoadingSpinner.jsx';

afterEach(() => {
  cleanup();
});

describe('LoadingSpinner Component', () => {
  it('renders progress indicator with appropriate accessibility attributes', () => {
    render(<LoadingSpinner />);

    const statusContainer = screen.getByRole('status');
    expect(statusContainer).toBeInTheDocument();
    expect(statusContainer).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading tool...')).toBeInTheDocument();
  });
});
