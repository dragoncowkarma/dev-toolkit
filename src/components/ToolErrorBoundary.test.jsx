import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToolErrorBoundary from './ToolErrorBoundary.jsx';

function Bomb() {
  throw new Error('boom');
}

describe('ToolErrorBoundary Component', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ToolErrorBoundary resetKey="tool-a">
        <p>Tool content</p>
      </ToolErrorBoundary>,
    );

    expect(screen.getByText('Tool content')).toBeInTheDocument();
  });

  it('renders an accessible fallback UI when a child throws', () => {
    render(
      <ToolErrorBoundary resetKey="tool-a">
        <Bomb />
      </ToolErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("This tool couldn't be loaded");
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('does not expose raw error details in the fallback UI', () => {
    render(
      <ToolErrorBoundary resetKey="tool-a">
        <Bomb />
      </ToolErrorBoundary>,
    );

    expect(screen.queryByText(/Error:/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('boom');
  });

  it('provides a keyboard-actionable refresh button that reloads the page', () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    render(
      <ToolErrorBoundary resetKey="tool-a">
        <Bomb />
      </ToolErrorBoundary>,
    );

    const refreshButton = screen.getByRole('button', { name: /refresh page/i });
    expect(refreshButton).toBeInTheDocument();
    fireEvent.click(refreshButton);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('recovers and renders new children after resetKey changes', () => {
    const { rerender } = render(
      <ToolErrorBoundary resetKey="tool-a">
        <Bomb />
      </ToolErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ToolErrorBoundary resetKey="tool-b">
        <p>Next tool content</p>
      </ToolErrorBoundary>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Next tool content')).toBeInTheDocument();
  });
});
