import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ColorTool from './ColorTool.jsx';

describe('ColorTool Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly with default color (#6366F1)', () => {
    render(<ColorTool />);
    expect(
      screen.getByRole('heading', { level: 2, name: /Color Converter/i })
    ).toBeInTheDocument();
    const input = screen.getByLabelText(/Color code input/i);
    expect(input.value).toBe('#6366F1');

    expect(screen.getByText('HEX')).toBeInTheDocument();
    expect(screen.getAllByText('#6366F1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('rgb(99, 102, 241)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hsl(239, 84%, 67%)').length).toBeGreaterThan(0);
  });

  it('updates color conversions when user types valid HEX, RGB, or HSL', () => {
    render(<ColorTool />);
    const input = screen.getByLabelText(/Color code input/i);

    // Type RGB format
    fireEvent.change(input, { target: { value: 'rgb(255, 0, 0)' } });
    expect(screen.getAllByText('#FF0000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('hsl(0, 100%, 50%)').length).toBeGreaterThan(0);

    // Type HSL format
    fireEvent.change(input, { target: { value: 'hsl(120, 100%, 50%)' } });
    expect(screen.getAllByText('#00FF00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('rgb(0, 255, 0)').length).toBeGreaterThan(0);
  });

  it('displays error message when an invalid color string is entered', () => {
    render(<ColorTool />);
    const input = screen.getByLabelText(/Color code input/i);

    fireEvent.change(input, { target: { value: 'invalid-color' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Unrecognized color format/i
    );

    fireEvent.change(input, { target: { value: '#12345' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Invalid HEX color format/i
    );

    fireEvent.change(input, { target: { value: 'rgb(300, 0, 0)' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /RGB values must be integers between 0 and 255/i
    );
  });

  it('updates color when a preset swatch is clicked', () => {
    render(<ColorTool />);
    const emeraldPreset = screen.getByRole('button', {
      name: /Select preset Emerald/i,
    });
    fireEvent.click(emeraldPreset);

    const input = screen.getByLabelText(/Color code input/i);
    expect(input.value).toBe('#34D399');
    expect(screen.getAllByText('rgb(52, 211, 153)').length).toBeGreaterThan(0);
  });

  it('copies HEX format when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<ColorTool />);
    const copyHexBtn = screen.getByRole('button', { name: /Copy HEX value/i });
    fireEvent.click(copyHexBtn);

    expect(writeTextMock).toHaveBeenCalledWith('#6366F1');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /HEX copied to clipboard!/i
      );
    });
  });

  it('triggers onBack when back button is clicked', () => {
    const onBackMock = vi.fn();
    render(<ColorTool onBack={onBackMock} />);
    const backBtn = screen.getByRole('button', {
      name: /Go back to tool dashboard/i,
    });
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalledTimes(1);
  });
});
