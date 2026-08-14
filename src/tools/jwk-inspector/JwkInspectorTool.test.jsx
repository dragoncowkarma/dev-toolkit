import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JwkInspectorTool from './JwkInspectorTool.jsx';

describe('JwkInspectorTool Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders tool header, toolbar, mode selector, and empty state', () => {
    render(<JwkInspectorTool />);
    expect(screen.getByText('JSON Web Key & PEM Toolkit')).toBeInTheDocument();
    expect(screen.getByLabelText(/JWK, JWKS, or Public Key PEM Input/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Paste a JSON Web Key \(JWK\), a JWK Set \(JWKS\), or a Public Key PEM/i)
    ).toBeInTheDocument();
  });

  it('loads sample JWK and displays key card and thumbprint', async () => {
    render(<JwkInspectorTool />);
    const loadBtn = screen.getByRole('button', { name: /Load sample/i });
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(screen.getByText(/Key #1/i)).toBeInTheDocument();
      expect(screen.getByText('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')).toBeInTheDocument();
    });
  });

  it('clears input and results when Clear is clicked', async () => {
    render(<JwkInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    await waitFor(() => {
      expect(screen.getByText(/Key #1/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Key #1/i)).not.toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  it('switches sample types to JWKS and renders multiple keys', async () => {
    render(<JwkInspectorTool />);
    const sampleSelect = screen.getByLabelText(/Sample type selector/i);
    fireEvent.change(sampleSelect, { target: { value: 'JWKS' } });

    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    await waitFor(() => {
      expect(screen.getByText(/Key #1 \(ec-key-1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Key #2 \(rsa-key-2\)/i)).toBeInTheDocument();
    });
  });

  it('displays inline error for malformed JSON input', async () => {
    render(<JwkInspectorTool />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{ invalid json' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/JSON Syntax Error/i);
    });
  });

  it('copies thumbprint to clipboard and updates button text', async () => {
    render(<JwkInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    await waitFor(() => {
      expect(screen.getByText('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button', { name: /^Copy$/i });
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs'
      );
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('resets copy feedback after 1500ms and cleans up timer on unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<JwkInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: /Load sample/i }));

    await vi.waitFor(() => {
      expect(screen.getByText('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByRole('button', { name: /^Copy$/i });
    fireEvent.click(copyButtons[0]);

    await vi.waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    vi.advanceTimersByTime(1500);

    await vi.waitFor(() => {
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    });

    fireEvent.click(copyButtons[0]);
    await vi.waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    unmount();
    expect(() => vi.advanceTimersByTime(1500)).not.toThrow();
    vi.useRealTimers();
  });

  it('has aria-live polite status region for accessibility', () => {
    const { container } = render(<JwkInspectorTool />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('role', 'status');
  });
});
