import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UrlQueryTool from './UrlQueryTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UrlQueryTool parsing & display', () => {
  it('parses full URL and renders URL components and parameters table', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, {
      target: { value: 'https://example.com:8080/search?q=apple&page=1&q=banana#section2' },
    });

    // Check status badge
    expect(screen.getByRole('status')).toHaveTextContent('Full URL');

    // Check URL components
    expect(screen.getByText('https://example.com:8080')).toBeInTheDocument();
    expect(screen.getByText('/search')).toBeInTheDocument();
    expect(screen.getByText('#section2')).toBeInTheDocument();

    // Check parameters table rows
    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 1 value')).toHaveValue('apple');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('page');
    expect(screen.getByLabelText('Parameter 2 value')).toHaveValue('1');
    expect(screen.getByLabelText('Parameter 3 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 3 value')).toHaveValue('banana');

    // Check duplicate key badges
    const dupBadges = screen.getAllByText('Duplicate');
    expect(dupBadges).toHaveLength(2); // row 1 and row 3 have key "q"
  });

  it('parses bare query strings with and without leading ?', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?foo=bar&baz=1' } });

    expect(screen.getByRole('status')).toHaveTextContent('Query String');
    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('foo');
    expect(screen.getByLabelText('Parameter 1 value')).toHaveValue('bar');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('baz');
    expect(screen.getByLabelText('Parameter 2 value')).toHaveValue('1');
  });
});

describe('UrlQueryTool edit, add, remove parameter behavior', () => {
  it('updates normalized result when editing parameter key or value', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: 'https://example.com/item?name=book&price=10' } });

    const value1Input = screen.getByLabelText('Parameter 1 value');
    fireEvent.change(value1Input, { target: { value: 'laptop' } });

    const normalizedResult = screen.getByLabelText('Normalized URL result');
    expect(normalizedResult).toHaveValue('https://example.com/item?name=laptop&price=10');
  });

  it('allows adding a new parameter and updates normalized result', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?a=1' } });

    const addBtn = screen.getByRole('button', { name: 'Add new query parameter' });
    fireEvent.click(addBtn);

    fireEvent.change(screen.getByLabelText('Parameter 2 key'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('Parameter 2 value'), { target: { value: '2' } });

    const normalizedResult = screen.getByLabelText('Normalized URL result');
    expect(normalizedResult).toHaveValue('?a=1&b=2');
  });

  it('allows removing a parameter and updates normalized result preserving order', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?a=1&b=2&c=3' } });

    const removeBtn2 = screen.getByRole('button', { name: 'Remove parameter 2' });
    fireEvent.click(removeBtn2);

    const normalizedResult = screen.getByLabelText('Normalized URL result');
    expect(normalizedResult).toHaveValue('?a=1&c=3');
  });
});

describe('UrlQueryTool copy controls & accessibility', () => {
  it('copies normalized result with success feedback and aria-label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: 'https://example.com/?q=test' } });

    const copyNormalizedBtn = screen.getByRole('button', { name: 'Copy normalized URL' });
    await act(async () => {
      fireEvent.click(copyNormalizedBtn);
    });

    expect(writeText).toHaveBeenCalledWith('https://example.com/?q=test');
    expect(screen.getByRole('button', { name: 'Copy normalized URL' })).toHaveTextContent('✓ Copied');
  });

  it('copies parameter individual value with distinct accessible name', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?foo=bar&baz=qux' } });

    const copyVal2Btn = screen.getByRole('button', { name: 'Copy value for parameter 2' });
    await act(async () => {
      fireEvent.click(copyVal2Btn);
    });

    expect(writeText).toHaveBeenCalledWith('qux');
    expect(copyVal2Btn).toHaveTextContent('✓ Copied');
  });

  it('handles copy error and displays role="alert"', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?foo=bar' } });

    const copyValBtn = screen.getByRole('button', { name: 'Copy value for parameter 1' });
    await act(async () => {
      fireEvent.click(copyValBtn);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });
});

describe('UrlQueryTool invalid input & clear', () => {
  it('displays role="alert" message for invalid URL input without crashing', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: 'http:// invalid url' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid URL format/);
  });

  it('clears all input and state when Clear button is clicked', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: 'https://example.com/?q=test' } });

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    expect(input).toHaveValue('');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
