import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CsvTool from './CsvTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CsvTool', () => {
  it('converts CSV input to JSON in real time', () => {
    render(<CsvTool />);
    fireEvent.change(screen.getByLabelText('CSV input'), {
      target: { value: 'name,team\nAda,Platform' },
    });
    expect(screen.getByLabelText('JSON output')).toHaveValue(
      '[\n  {\n    "name": "Ada",\n    "team": "Platform"\n  }\n]',
    );
  });

  it('shows CSV validation errors with an alert role', () => {
    render(<CsvTool />);
    fireEvent.change(screen.getByLabelText('CSV input'), { target: { value: 'name,team\nAda' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Ragged row has 1 columns');
  });

  it('swaps direction and makes the converted value editable JSON input', () => {
    render(<CsvTool />);
    fireEvent.change(screen.getByLabelText('CSV input'), {
      target: { value: 'name\nAda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Swap conversion direction' }));
    expect(screen.getByLabelText('JSON input')).toHaveValue('[\n  {\n    "name": "Ada"\n  }\n]');
    expect(screen.getByLabelText('CSV output')).toHaveValue('name\nAda');
  });

  it('loads an appropriate sample for the current direction', () => {
    render(<CsvTool />);
    fireEvent.change(screen.getByLabelText('CSV input'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load sample' }));
    expect(screen.getByLabelText('CSV input').value).toContain('Ada,Platform');
  });

  it('copies output and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CsvTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(screen.getByLabelText('JSON output').value);
    expect(screen.getByRole('status')).toHaveTextContent('Copied output to clipboard.');
  });

  it('reports clipboard failures as alerts', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<CsvTool />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to copy output to clipboard.');
  });
});
