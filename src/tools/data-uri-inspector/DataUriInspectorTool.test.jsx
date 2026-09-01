import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DataUriInspectorTool from './DataUriInspectorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function typeUrl(value) {
  fireEvent.change(screen.getByLabelText('Data URL'), { target: { value } });
}

describe('DataUriInspectorTool — successful inspection', () => {
  it('inspects a percent-encoded textual data URL', async () => {
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain;charset=utf-8,Hello%2C%20World%21');

    await waitFor(() => expect(screen.getByText('text/plain')).toBeInTheDocument());
    expect(screen.getByText('charset=utf-8')).toBeInTheDocument();
    expect(screen.getByText('percent-encoded')).toBeInTheDocument();
    expect(screen.getByText('13 bytes')).toBeInTheDocument();
    expect(screen.getByLabelText(/Decoded preview \(text\)/)).toHaveValue('Hello, World!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('inspects a base64 binary data URL with a hex preview', async () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
    const base64 = btoa(String.fromCharCode(...bytes));
    render(<DataUriInspectorTool />);

    typeUrl(`data:image/png;base64,${base64}`);

    await waitFor(() => expect(screen.getByText('image/png')).toBeInTheDocument());
    expect(screen.getByText('base64')).toBeInTheDocument();
    expect(screen.getByLabelText(/Decoded preview \(hex\)/)).toHaveValue(
      '89 50 4e 47 ff fe'
    );
  });
});

describe('DataUriInspectorTool — accessible error rendering', () => {
  it('renders a role="alert" error for a malformed data URL instead of throwing', async () => {
    render(<DataUriInspectorTool />);

    typeUrl('not-a-data-url');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/must start with/);
    expect(screen.queryByLabelText('Canonical URI')).not.toBeInTheDocument();
  });

  it('clears the error once the input becomes valid', async () => {
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain;base64');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    typeUrl('data:text/plain,hi');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

describe('DataUriInspectorTool — copy feedback', () => {
  it('announces canonical URI copy status in a polite live region', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain,hi');
    await waitFor(() => expect(screen.getByLabelText('Canonical URI')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Canonical URI copied to clipboard');
  });

  it('announces decoded preview copy status in a polite live region', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain,hi');
    await waitFor(() => expect(screen.getByLabelText(/Decoded preview/)).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[1]);
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Decoded preview copied to clipboard');
  });

  it('reports a copy failure as an accessible alert', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain,hi');
    await waitFor(() => expect(screen.getByLabelText('Canonical URI')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to copy the canonical URI to clipboard.'
    );
  });
});

describe('DataUriInspectorTool — safe rendering of decoded content', () => {
  it('never renders decoded HTML/SVG content as active markup', async () => {
    const rawSvg = '<svg onload="window.__pwned = true"><script>1</script></svg>';
    const payload = encodeURIComponent(rawSvg);
    render(<DataUriInspectorTool />);

    typeUrl(`data:image/svg+xml,${payload}`);

    await waitFor(() =>
      expect(screen.getByLabelText(/Decoded preview/)).toHaveValue(
        '<svg onload=\\"window.__pwned = true\\"><script>1</script></svg>'
      )
    );
    // The preview is rendered inside a read-only textarea value, never as innerHTML.
    expect(document.querySelector('svg')).not.toBeInTheDocument();
    expect(document.querySelector('script[src]')).not.toBeInTheDocument();
    expect(window.__pwned).toBeUndefined();
  });
});

describe('DataUriInspectorTool — clear', () => {
  it('clears input, result, and errors', async () => {
    render(<DataUriInspectorTool />);

    typeUrl('data:text/plain,hi');
    await waitFor(() => expect(screen.getByLabelText('Canonical URI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Data URL')).toHaveValue('');
    expect(screen.queryByLabelText('Canonical URI')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
