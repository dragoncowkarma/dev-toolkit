import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HttpHeadersTool from './HttpHeadersTool.jsx';

function getInput() {
  return screen.getByLabelText('Raw header input');
}

function typeRaw(value) {
  fireEvent.change(getInput(), { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('HttpHeadersTool live parsing', () => {
  it('parses headers as the user types and renders a summary and table rows', () => {
    render(<HttpHeadersTool />);

    typeRaw('Host: example.com\nAccept: */*\n');

    expect(screen.getByRole('status')).toHaveTextContent('2 headers parsed');
    expect(screen.getByText(/2 headers parsed/)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Parsed header fields' });
    expect(within(table).getByText('example.com')).toBeInTheDocument();
    expect(within(table).getByText('*/*')).toBeInTheDocument();
  });

  it('renders a role="alert" error for a malformed header line', () => {
    render(<HttpHeadersTool />);

    typeRaw('Host: example.com\nNotAHeaderLine\n');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('line 2');
  });
});

describe('HttpHeadersTool mode selection', () => {
  it('lets the user force request or response start-line interpretation', () => {
    render(<HttpHeadersTool />);

    fireEvent.click(screen.getByLabelText('Response'));
    typeRaw('HTTP/1.1 500 Internal Server Error\nContent-Type: text/plain\n');
    expect(screen.getByText(/response start line detected/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Request'));
    typeRaw('GET / HTTP/1.1\nHost: example.com\n');
    expect(screen.getByText(/request start line detected/)).toBeInTheDocument();
  });
});

describe('HttpHeadersTool row filtering', () => {
  it('filters the parsed table by the search query', () => {
    render(<HttpHeadersTool />);

    typeRaw('Content-Type: application/json\nCache-Control: no-store\n');

    const filter = screen.getByLabelText('Filter parsed headers');
    fireEvent.change(filter, { target: { value: 'cache' } });

    const table = screen.getByRole('table', { name: 'Parsed header fields' });
    expect(within(table).getByText('Cache-Control')).toBeInTheDocument();
    expect(within(table).queryByText('Content-Type')).not.toBeInTheDocument();
  });
});

describe('HttpHeadersTool sample loading', () => {
  it('loads the sample request and switches to request mode', () => {
    render(<HttpHeadersTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample request' }));

    expect(getInput().value).toContain('GET /api/widgets?id=42 HTTP/1.1');
    expect(screen.getByLabelText('Request')).toBeChecked();
  });

  it('loads the sample response and switches to response mode', () => {
    render(<HttpHeadersTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sample response' }));

    expect(getInput().value).toContain('HTTP/1.1 200 OK');
    expect(screen.getByLabelText('Response')).toBeChecked();
  });
});

describe('HttpHeadersTool duplicate indicators', () => {
  it('marks duplicate header rows and surfaces a duplicate-field advisory', () => {
    render(<HttpHeadersTool />);

    typeRaw('Accept-Language: en\nAccept-Language: fr\nHost: a\n');

    const table = screen.getByRole('table', { name: 'Parsed header fields' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Yes')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Yes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();

    const advisories = screen.getByLabelText('Header advisories');
    expect(within(advisories).getByText(/Accept-Language/)).toBeInTheDocument();
  });
});

describe('HttpHeadersTool copy and clear', () => {
  it('copies normalized output and shows status feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HttpHeadersTool />);
    typeRaw('Host: example.com\n');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy normalized' }));
    });

    expect(writeText).toHaveBeenCalledWith('Host: example.com');
    expect(screen.getByText('Normalized headers copied to clipboard.')).toBeInTheDocument();
  });

  it('shows failure feedback when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HttpHeadersTool />);
    typeRaw('Host: example.com\n');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy normalized' }));
    });

    const status = screen.getByText('Unable to copy normalized headers to the clipboard.');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('clears the raw input, filter, and parsed table on Clear', () => {
    render(<HttpHeadersTool />);

    typeRaw('Host: example.com\n');
    expect(screen.getByRole('table', { name: 'Parsed header fields' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(getInput().value).toBe('');
    expect(screen.queryByRole('table', { name: 'Parsed header fields' })).not.toBeInTheDocument();
  });
});

describe('HttpHeadersTool accessibility', () => {
  it('exposes the tool as a labeled region', () => {
    expect(() => render(<HttpHeadersTool />)).not.toThrow();
    expect(screen.getByRole('region', { name: 'HTTP Header Inspector Tool' })).toBeInTheDocument();
  });

  it('gives the raw input and filter accessible names', () => {
    render(<HttpHeadersTool />);
    typeRaw('Host: example.com\n');

    expect(screen.getByLabelText('Raw header input')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter parsed headers')).toBeInTheDocument();
  });
});
