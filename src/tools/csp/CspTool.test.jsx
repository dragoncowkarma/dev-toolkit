import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CspTool from './CspTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CspTool', () => {
  it('switches between parser and generator modes', () => {
    render(<CspTool />);
    expect(screen.getByRole('tabpanel', { name: 'Parser and evaluator' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Generator / Builder' }));

    expect(screen.getByRole('tabpanel', { name: 'Generator and builder' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Generator / Builder' }))
      .toHaveAttribute('aria-selected', 'true');
  });

  it('calculates risks live and displays directive rows', () => {
    render(<CspTool />);
    fireEvent.change(screen.getByLabelText('Raw CSP header input'), {
      target: { value: "default-src 'self'; script-src 'unsafe-inline'" },
    });

    expect(screen.getByText('High risk')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Parsed CSP directives' })).toBeInTheDocument();
    expect(screen.getByText(/permits 'unsafe-inline'/)).toBeInTheDocument();
  });

  it('loads parser samples and clears parser input', () => {
    render(<CspTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load CSP sample policy' }));
    expect(screen.getByLabelText('Raw CSP header input')).not.toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Clear CSP parser input' }));
    expect(screen.getByLabelText('Raw CSP header input')).toHaveValue('');
  });

  it('loads builder presets and clears generated output', () => {
    render(<CspTool />);
    fireEvent.click(screen.getByRole('tab', { name: 'Generator / Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'SPA Default' }));
    expect(screen.getByLabelText('Generated CSP header output').value)
      .toContain("style-src 'self' 'unsafe-inline'");

    fireEvent.click(screen.getByRole('button', { name: 'Clear CSP builder' }));
    expect(screen.getByLabelText('Generated CSP header output')).toHaveValue('');
  });

  it('uses the report-only header name for the report-only preset', () => {
    render(<CspTool />);
    fireEvent.click(screen.getByRole('tab', { name: 'Generator / Builder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report-Only Mode' }));

    expect(screen.getByLabelText('Generated CSP header output').value)
      .toMatch(/^Content-Security-Policy-Report-Only:/);
  });

  it('copies the generated header and announces feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CspTool />);
    fireEvent.click(screen.getByRole('tab', { name: 'Generator / Builder' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy generated CSP header' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Content-Security-Policy:'));
    expect(screen.getByRole('status')).toHaveTextContent('CSP header copied to clipboard.');
  });

  it('exposes alert, status, and labeled controls for accessibility', () => {
    render(<CspTool />);
    fireEvent.change(screen.getByLabelText('Raw CSP header input'), {
      target: { value: "script-src 'unclosed" },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid quote usage');
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Generator / Builder' }));
    expect(screen.getByLabelText('Enable script-src')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom sources, hashes, or nonces for script-src'))
      .toBeInTheDocument();
  });
});
