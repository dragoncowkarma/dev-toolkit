import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IniFormatterTool from './IniFormatterTool.jsx';
import { SAMPLE_INI } from './iniFormatter.utils.js';

describe('IniFormatterTool', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header and controls properly', () => {
    render(<IniFormatterTool />);
    expect(screen.getByRole('heading', { level: 2, name: 'INI Formatter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Formatted INI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Output' })).toBeInTheDocument();
  });

  it('displays formatted output for sample input by default', () => {
    render(<IniFormatterTool />);
    const inputArea = screen.getByLabelText('Raw INI Input');
    const outputArea = screen.getByLabelText('Formatted INI Output');

    expect(inputArea.value).toBe(SAMPLE_INI);
    expect(outputArea.value).toContain('[database]');
    expect(outputArea.value).toContain('host = localhost');
  });

  it('switches to JSON Preview view mode', () => {
    render(<IniFormatterTool />);
    const jsonBtn = screen.getByRole('button', { name: 'JSON Preview' });

    fireEvent.click(jsonBtn);

    const outputArea = screen.getByLabelText('JSON Output');
    expect(outputArea.value).toContain('"database"');
    expect(outputArea.value).toContain('"host": "localhost"');
  });

  it('clears input when Clear button is clicked', () => {
    render(<IniFormatterTool />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });

    fireEvent.click(clearBtn);

    const inputArea = screen.getByLabelText('Raw INI Input');
    const outputArea = screen.getByLabelText('Formatted INI Output');

    expect(inputArea.value).toBe('');
    expect(outputArea.value).toBe('');
  });

  it('loads sample when Load Sample button is clicked', () => {
    render(<IniFormatterTool />);
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    const sampleBtn = screen.getByRole('button', { name: 'Load Sample' });

    fireEvent.click(clearBtn);
    fireEvent.click(sampleBtn);

    const inputArea = screen.getByLabelText('Raw INI Input');
    expect(inputArea.value).toBe(SAMPLE_INI);
  });

  it('displays syntax error banner on invalid INI input', () => {
    render(<IniFormatterTool />);
    const inputArea = screen.getByLabelText('Raw INI Input');

    fireEvent.change(inputArea, { target: { value: '[unclosed_section' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Line 1: Unclosed section header\./i)).toBeInTheDocument();
  });

  it('copies formatted output to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<IniFormatterTool />);
    const copyBtn = screen.getByRole('button', { name: 'Copy Output' });

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Copied output to clipboard!');
  });
});
