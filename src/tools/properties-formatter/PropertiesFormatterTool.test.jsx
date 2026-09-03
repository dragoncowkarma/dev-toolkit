import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PropertiesFormatterTool from './PropertiesFormatterTool.jsx';
import { SAMPLE_PROPERTIES } from './propertiesFormatter.utils.js';

describe('PropertiesFormatterTool', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header and controls properly', () => {
    render(<PropertiesFormatterTool />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Properties Formatter' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Normalized Properties' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Properties' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
  });

  it('loads the sample by default and normalizes it', () => {
    render(<PropertiesFormatterTool />);
    const inputArea = screen.getByLabelText('Raw .properties Input');
    const outputArea = screen.getByLabelText('Normalized Properties Output');

    expect(inputArea.value).toBe(SAMPLE_PROPERTIES);
    expect(outputArea.value).toContain('app.name=Dev Toolkit Pro');
    expect(outputArea.value).toContain('greeting.unicode=한글 Hello');
  });

  it('switches to the JSON Preview view mode', () => {
    render(<PropertiesFormatterTool />);
    fireEvent.click(screen.getByRole('button', { name: 'JSON Preview' }));

    const outputArea = screen.getByLabelText('JSON Output');
    expect(outputArea.value).toContain('"app.name": "Dev Toolkit Pro"');
  });

  it('shows a duplicate-key indication for the sample input', () => {
    render(<PropertiesFormatterTool />);
    expect(screen.getByText(/Duplicate keys detected/)).toHaveTextContent('app.name');
    expect(screen.getAllByText('duplicate').length).toBeGreaterThanOrEqual(2);
  });

  it('lists parsed entries in source order with line numbers', () => {
    render(<PropertiesFormatterTool />);
    const table = screen.getByRole('table');
    const firstDataRow = table.querySelectorAll('tbody tr')[0];
    expect(firstDataRow).toHaveTextContent('app.name');
  });

  it('clears input when Clear is clicked', () => {
    render(<PropertiesFormatterTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const inputArea = screen.getByLabelText('Raw .properties Input');
    const outputArea = screen.getByLabelText('Normalized Properties Output');
    expect(inputArea.value).toBe('');
    expect(outputArea.value).toBe('');
  });

  it('reloads the sample when Load Sample is clicked', () => {
    render(<PropertiesFormatterTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    const inputArea = screen.getByLabelText('Raw .properties Input');
    expect(inputArea.value).toBe(SAMPLE_PROPERTIES);
  });

  it('shows an accessible error alert for malformed input without crashing', () => {
    render(<PropertiesFormatterTool />);
    const inputArea = screen.getByLabelText('Raw .properties Input');

    fireEvent.change(inputArea, { target: { value: 'key = \\uZZZZ' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Line 1: Malformed \\uXXXX/)).toBeInTheDocument();
    const outputArea = screen.getByLabelText('Normalized Properties Output');
    expect(outputArea.value).toBe('');
  });

  it('shows an accessible error alert for a dangling continuation', () => {
    render(<PropertiesFormatterTool />);
    const inputArea = screen.getByLabelText('Raw .properties Input');

    fireEvent.change(inputArea, { target: { value: 'key = value\\' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Dangling line continuation/)).toBeInTheDocument();
  });

  it('copies normalized properties output with status feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<PropertiesFormatterTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Properties' }));
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copied normalized properties to clipboard!'
    );
  });

  it('copies JSON output with status feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<PropertiesFormatterTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Copied JSON to clipboard!');
  });

  it('reports a clipboard failure without throwing', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<PropertiesFormatterTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Properties' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not copy normalized properties to clipboard.'
    );
  });
});
