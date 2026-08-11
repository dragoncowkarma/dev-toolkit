import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CssGradientTool from './CssGradientTool.jsx';

describe('CssGradientTool Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders tool with default linear gradient controls and code preview', () => {
    render(<CssGradientTool />);
    expect(screen.getByRole('heading', { level: 3, name: /Gradient Type/i })).toBeInTheDocument();
    expect(screen.getByText(/background: linear-gradient/i)).toBeInTheDocument();
  });

  it('adds a new color stop and updates generated CSS', () => {
    render(<CssGradientTool />);
    const addBtn = screen.getByRole('button', { name: /\+ Add Stop/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Color Stops \(4\)/i)).toBeInTheDocument();
  });

  it('switches between linear, radial, and conic gradient types', () => {
    render(<CssGradientTool />);

    // Switch to Radial
    const radialBtn = screen.getByRole('button', { name: /^Radial$/i });
    fireEvent.click(radialBtn);
    expect(screen.getByText(/background: radial-gradient/i)).toBeInTheDocument();

    // Switch to Conic
    const conicBtn = screen.getByRole('button', { name: /^Conic$/i });
    fireEvent.click(conicBtn);
    expect(screen.getByText(/background: conic-gradient/i)).toBeInTheDocument();
  });

  it('surfaces role="alert" error message on invalid color input', () => {
    render(<CssGradientTool />);
    const colorTextInputs = screen.getAllByLabelText(/Color text input for stop/i);

    fireEvent.change(colorTextInputs[0], { target: { value: 'invalid-color-value' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid color value/i);
  });

  it('copies generated CSS declaration and reports status via aria-live', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<CssGradientTool />);
    const copyBtn = screen.getByRole('button', { name: /Copy CSS/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('background: linear-gradient')
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Copied CSS declaration to clipboard!/i);
    });
  });

  it('applies a preset gradient when clicked', () => {
    render(<CssGradientTool />);
    const oceanPresetBtn = screen.getByRole('button', { name: /Ocean Glow/i });
    fireEvent.click(oceanPresetBtn);

    expect(screen.getByText(/background: radial-gradient/i)).toBeInTheDocument();
  });
});
