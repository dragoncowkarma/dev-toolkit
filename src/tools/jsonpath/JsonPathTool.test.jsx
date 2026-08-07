import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonPathTool from './JsonPathTool.jsx';

const JSON_SOURCE = JSON.stringify({
  items: [
    { name: 'Ada', active: true },
    { name: 'Lin', active: false },
  ],
});

function fillQuery(json = JSON_SOURCE, expression = '$.items[*].name') {
  fireEvent.change(screen.getByLabelText('JSON input'), { target: { value: json } });
  fireEvent.change(screen.getByLabelText('JSONPath expression'), {
    target: { value: expression },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JsonPathTool', () => {
  it('renders formatted matches and an accessible match count', () => {
    render(<JsonPathTool />);
    fillQuery();

    expect(screen.getByLabelText('JSONPath output')).toHaveValue('[\n  "Ada",\n  "Lin"\n]');
    expect(screen.getByText('2 matches found')).toBeInTheDocument();
  });

  it('renders no-match output without treating it as an error', () => {
    render(<JsonPathTool />);
    fillQuery(JSON_SOURCE, '$.items[*].missing');

    expect(screen.getByLabelText('JSONPath output')).toHaveValue('[]');
    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an accessible alert for invalid JSON input', () => {
    render(<JsonPathTool />);
    fillQuery('{"items": }');

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSON:');
    expect(screen.getByLabelText('JSONPath output')).toHaveValue('');
  });

  it('shows an accessible alert for invalid JSONPath syntax', () => {
    render(<JsonPathTool />);
    fillQuery(JSON_SOURCE, '$.items[');

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid JSONPath:');
    expect(screen.getByLabelText('JSONPath output')).toHaveValue('');
  });

  it('loads both sample values and marks the sample control as pressed', () => {
    render(<JsonPathTool />);
    const sampleButton = screen.getByRole('button', {
      name: 'Load sample JSON and JSONPath',
    });

    fireEvent.click(sampleButton);

    expect(sampleButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('JSON input').value).toContain('Nigel Rees');
    expect(screen.getByLabelText('JSONPath expression')).toHaveValue(
      '$.store.book[?(@.price < 10)].author',
    );
    expect(screen.getByText('2 matches found')).toBeInTheDocument();
  });

  it('clears both fields, feedback, and the sample pressed state', () => {
    render(<JsonPathTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load sample JSON and JSONPath' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'Clear JSON input and JSONPath expression',
    }));

    expect(screen.getByLabelText('JSON input')).toHaveValue('');
    expect(screen.getByLabelText('JSONPath expression')).toHaveValue('');
    expect(screen.getByLabelText('JSONPath output')).toHaveValue('');
    expect(screen.getByRole('button', {
      name: 'Load sample JSON and JSONPath',
    })).toHaveAttribute('aria-pressed', 'false');
  });

  it('copies formatted output and announces successful clipboard feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<JsonPathTool />);
    fillQuery();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('[\n  "Ada",\n  "Lin"\n]');
    expect(screen.getByText('Output copied to clipboard.')).toHaveAttribute('aria-live', 'polite');
  });

  it('announces failed clipboard writes without losing evaluated output', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<JsonPathTool />);
    fillQuery();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy output to clipboard' }));
      await Promise.resolve();
    });

    expect(screen.getByText('Failed to copy output to clipboard.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByLabelText('JSONPath output')).toHaveValue('[\n  "Ada",\n  "Lin"\n]');
  });
});
