import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LineToolsTool from './LineToolsTool.jsx';

describe('LineToolsTool component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders input, output, options, and initial stats', () => {
    render(<LineToolsTool />);

    expect(screen.getByLabelText('Input text')).toBeInTheDocument();
    expect(screen.getByLabelText('Transformed result')).toBeInTheDocument();
    expect(screen.getByText('Line Tools')).toBeInTheDocument();
    expect(screen.getByText('Orig Lines')).toBeInTheDocument();
    expect(screen.getByText('Removed Dupes')).toBeInTheDocument();
  });

  it('updates result and statistics when input text changes', () => {
    render(<LineToolsTool />);

    const inputArea = screen.getByLabelText('Input text');
    fireEvent.change(inputArea, { target: { value: 'line1\nline2\nline3' } });

    const outputArea = screen.getByLabelText('Transformed result');
    expect(outputArea.value).toBe('line1\nline2\nline3');

    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('applies trim, deduplicate, and natural sort options dynamically', () => {
    render(<LineToolsTool />);

    const inputArea = screen.getByLabelText('Input text');
    fireEvent.change(inputArea, { target: { value: ' item10 \n item2 \n item2 ' } });

    // Enable trim
    const trimCheckbox = screen.getByLabelText('Trim line whitespace');
    fireEvent.click(trimCheckbox);

    // Enable deduplicate
    const dedupeCheckbox = screen.getByLabelText('Remove duplicate lines');
    fireEvent.click(dedupeCheckbox);

    // Enable ascending sort
    const sortSelect = screen.getByLabelText('Sort direction');
    fireEvent.change(sortSelect, { target: { value: 'asc' } });

    const outputArea = screen.getByLabelText('Transformed result');
    expect(outputArea.value).toBe('item2\nitem10');
  });

  it('applies line numbering with custom starting index', () => {
    render(<LineToolsTool />);

    const inputArea = screen.getByLabelText('Input text');
    fireEvent.change(inputArea, { target: { value: 'first\nsecond' } });

    const numberCheckbox = screen.getByLabelText('Number lines');
    fireEvent.click(numberCheckbox);

    const startInput = screen.getByLabelText('Line numbering start value');
    fireEvent.change(startInput, { target: { value: '5' } });

    const outputArea = screen.getByLabelText('Transformed result');
    expect(outputArea.value).toBe('5. first\n6. second');
  });

  it('allows start number to be set to 0', () => {
    render(<LineToolsTool />);

    const inputArea = screen.getByLabelText('Input text');
    fireEvent.change(inputArea, { target: { value: 'first\nsecond' } });

    const numberCheckbox = screen.getByLabelText('Number lines');
    fireEvent.click(numberCheckbox);

    const startInput = screen.getByLabelText('Line numbering start value');
    fireEvent.change(startInput, { target: { value: '0' } });

    expect(startInput.value).toBe('0');

    const outputArea = screen.getByLabelText('Transformed result');
    expect(outputArea.value).toBe('0. first\n1. second');
  });

  it('copies output to clipboard and displays status notice', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<LineToolsTool />);

    const inputArea = screen.getByLabelText('Input text');
    fireEvent.change(inputArea, { target: { value: 'sample data' } });

    const copyBtn = screen.getByLabelText('Copy transformed text to clipboard');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('sample data');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Copied result to clipboard.');
    });
  });
});
