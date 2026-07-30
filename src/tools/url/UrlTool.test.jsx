import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UrlTool from './UrlTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('UrlTool encode/decode conversion', () => {
  it('encodes text in real time by default', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), {
      target: { value: 'hello world&more' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('Encoded URL')).toHaveValue('hello%20world%26more')
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('decodes percent-encoded text after switching to Decode mode', async () => {
    render(<UrlTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Encoded URL'), {
      target: { value: 'hello%20world' },
    });

    await waitFor(() => expect(screen.getByLabelText('Text / URL')).toHaveValue('hello world'));
  });

  it('shows a descriptive error for malformed percent-encoding', async () => {
    render(<UrlTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Encoded URL'), { target: { value: '100%' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid percent-encoding/);
  });
});

describe('UrlTool swap', () => {
  it('swaps the output into the input and flips the mode', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), { target: { value: 'a b' } });
    await waitFor(() => expect(screen.getByLabelText('Encoded URL')).toHaveValue('a%20b'));

    fireEvent.click(screen.getByRole('button', { name: '⇅ Swap' }));

    expect(screen.getByLabelText('Encoded URL')).toHaveValue('a%20b');
    await waitFor(() => expect(screen.getByLabelText('Text / URL')).toHaveValue('a b'));
  });

  it('disables Swap while the conversion has an error', async () => {
    render(<UrlTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    fireEvent.change(screen.getByLabelText('Encoded URL'), { target: { value: '100%' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '⇅ Swap' })).toBeDisabled()
    );
  });
});

describe('UrlTool clear', () => {
  it('resets input, output, and error state', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Encoded URL')).toHaveValue('hello'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Text / URL')).toHaveValue('');
    expect(screen.getByLabelText('Encoded URL')).toHaveValue('');
  });
});

describe('UrlTool clipboard', () => {
  it('reports a copy failure without disabling a valid Swap', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Encoded URL')).toHaveValue('hello'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
    expect(screen.getByRole('button', { name: '⇅ Swap' })).not.toBeDisabled();
  });

  it('copies the output to the clipboard on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), { target: { value: 'hello' } });
    await waitFor(() => expect(screen.getByLabelText('Encoded URL')).toHaveValue('hello'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith('hello');
    expect(await screen.findByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
  });
});

describe('UrlTool URL validation', () => {
  it('shows a valid-URL badge for a well-formed absolute URL', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), {
      target: { value: 'https://example.com/path?a=1' },
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Valid URL');
  });

  it('shows a not-a-full-URL badge for plain text', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), { target: { value: 'just text' } });

    expect(await screen.findByRole('status')).toHaveTextContent('Not a full URL');
  });

  it('hides the badge when the input is empty', () => {
    render(<UrlTool />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('UrlTool query string parsing', () => {
  it('parses query parameters from a full URL into a table', async () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), {
      target: { value: 'https://example.com/search?q=hello+world&sort=asc' },
    });

    expect(await screen.findByText('q')).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByText('sort')).toBeInTheDocument();
    expect(screen.getByText('asc')).toBeInTheDocument();
  });

  it('shows an empty-state message when there is no query string', () => {
    render(<UrlTool />);
    expect(screen.getByText('No query parameters detected in the input.')).toBeInTheDocument();
  });

  it('keeps the empty state for plain text containing "&" but no "?" or "="', () => {
    render(<UrlTool />);

    fireEvent.change(screen.getByLabelText('Text / URL'), {
      target: { value: 'hello world&more' },
    });

    expect(screen.getByText('No query parameters detected in the input.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
