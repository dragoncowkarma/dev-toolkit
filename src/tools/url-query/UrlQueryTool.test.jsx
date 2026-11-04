import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('maintains input focus when editing parameter key character-by-character', async () => {
    const user = userEvent.setup();
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?q=search' } });

    const key1Input = screen.getByLabelText('Parameter 1 key');
    await user.type(key1Input, 'uery');

    expect(key1Input).toHaveValue('query');
    expect(document.activeElement).toBe(key1Input);
  });
});

describe('UrlQueryTool copy controls & accessibility', () => {
  it('copies normalized result with success feedback and aria-label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: 'https://example.com/?q=test' } });

    const copyNormalizedBtn = screen.getByRole('button', { name: 'Copy normalized URL' });
    await act(async () => {
      fireEvent.click(copyNormalizedBtn);
    });

    expect(writeText).toHaveBeenCalledWith('https://example.com/?q=test');
    expect(screen.getByRole('button', { name: 'Copy normalized URL' })).toHaveTextContent(
      '✓ Copied'
    );
  });

  it('copies parameter individual value with distinct accessible name', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

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
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
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

  it(
    'parses input correctly when Clear is clicked from empty state followed by query entry',
    async () => {
      render(<UrlQueryTool />);

      const input = screen.getByLabelText('URL or query string input');
      expect(input).toHaveValue('');

      const clearBtn = screen.getByRole('button', { name: 'Clear' });
      fireEvent.click(clearBtn);

      fireEvent.change(input, { target: { value: '?q=test&page=1' } });

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByDisplayValue('test')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1')).toBeInTheDocument();
      expect(screen.getByLabelText('Normalized URL result')).toHaveValue('?q=test&page=1');
    }
  );

  it(
    'updates parsed state when input changes after reordering duplicate rows',
    async () => {
      render(<UrlQueryTool />);

      const input = screen.getByLabelText('URL or query string input');
      fireEvent.change(input, { target: { value: '?a=1&a=1' } });

      expect(await screen.findByRole('table')).toBeInTheDocument();

      const moveDownBtn = screen.getByRole('button', { name: 'Move parameter 1 down' });
      fireEvent.click(moveDownBtn);

      fireEvent.change(input, { target: { value: '?a=1&a=1&b=2' } });

      expect(await screen.findByDisplayValue('b')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2')).toBeInTheDocument();
      expect(screen.getByLabelText('Normalized URL result')).toHaveValue('?a=1&a=1&b=2');
    }
  );
});

describe('UrlQueryTool parameter reordering & accessibility', () => {
  it('renders distinct accessible button labels identifying direction and position', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?a=1&b=2&c=3' } });

    expect(screen.getByRole('button', { name: 'Move parameter 1 up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move parameter 1 down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move parameter 2 up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move parameter 2 down' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move parameter 3 up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move parameter 3 down' })).toBeInTheDocument();
  });

  it('disables boundary move controls correctly for multi-row and single-row params', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?a=1&b=2&c=3' } });

    // First row: up disabled, down enabled
    expect(screen.getByRole('button', { name: 'Move parameter 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move parameter 1 down' })).toBeEnabled();

    // Middle row: both enabled
    expect(screen.getByRole('button', { name: 'Move parameter 2 up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move parameter 2 down' })).toBeEnabled();

    // Last row: up enabled, down disabled
    expect(screen.getByRole('button', { name: 'Move parameter 3 up' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move parameter 3 down' })).toBeDisabled();

    // Single row edge case
    fireEvent.change(input, { target: { value: '?single=val' } });
    expect(screen.getByRole('button', { name: 'Move parameter 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move parameter 1 down' })).toBeDisabled();
  });

  it('moves rows and updates normalized output preserving duplicate keys', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, {
      target: { value: 'https://example.com/search?q=apple&page=1&q=banana' },
    });

    const normalizedResult = screen.getByLabelText('Normalized URL result');
    expect(normalizedResult).toHaveValue(
      'https://example.com/search?q=apple&page=1&q=banana'
    );

    // Move first row down (q=apple moves to row 2)
    const moveDown1 = screen.getByRole('button', { name: 'Move parameter 1 down' });
    fireEvent.click(moveDown1);

    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('page');
    expect(screen.getByLabelText('Parameter 1 value')).toHaveValue('1');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 2 value')).toHaveValue('apple');
    expect(screen.getByLabelText('Parameter 3 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 3 value')).toHaveValue('banana');
    expect(normalizedResult).toHaveValue(
      'https://example.com/search?page=1&q=apple&q=banana'
    );

    // Move row 2 up (q=apple moves back to row 1)
    const moveUp2 = screen.getByRole('button', { name: 'Move parameter 2 up' });
    fireEvent.click(moveUp2);

    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 1 value')).toHaveValue('apple');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('page');
    expect(screen.getByLabelText('Parameter 2 value')).toHaveValue('1');
    expect(normalizedResult).toHaveValue(
      'https://example.com/search?q=apple&page=1&q=banana'
    );

    // Move last row (q=banana) up to row 2
    const moveUp3 = screen.getByRole('button', { name: 'Move parameter 3 up' });
    fireEvent.click(moveUp3);

    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 1 value')).toHaveValue('apple');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('q');
    expect(screen.getByLabelText('Parameter 2 value')).toHaveValue('banana');
    expect(screen.getByLabelText('Parameter 3 key')).toHaveValue('page');
    expect(screen.getByLabelText('Parameter 3 value')).toHaveValue('1');
    expect(normalizedResult).toHaveValue(
      'https://example.com/search?q=apple&q=banana&page=1'
    );

    // Both duplicate "q" parameters should retain duplicate badges
    const dupBadges = screen.getAllByText('Duplicate');
    expect(dupBadges).toHaveLength(2);
  });

  it('preserves stable row identity and focus without avoidable focus loss', async () => {
    render(<UrlQueryTool />);

    const input = screen.getByLabelText('URL or query string input');
    fireEvent.change(input, { target: { value: '?first=1&second=2&third=3' } });

    // Focus Move down on row 1 and click it
    const moveDownBtn = screen.getByRole('button', { name: 'Move parameter 1 down' });
    moveDownBtn.focus();
    expect(document.activeElement).toBe(moveDownBtn);

    fireEvent.click(moveDownBtn);

    // After moving, row 1 moved to row 2. The button that was clicked was inside that moved row
    // and remains in the document and focused (not unmounted).
    expect(document.activeElement).toBeInTheDocument();
    expect(document.activeElement.tagName).toBe('BUTTON');

    // Values of the rows are now swapped
    expect(screen.getByLabelText('Parameter 1 key')).toHaveValue('second');
    expect(screen.getByLabelText('Parameter 2 key')).toHaveValue('first');
  });
});
