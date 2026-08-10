import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QrCodeTool from './QrCodeTool.jsx';

function mockCanvas() {
  const context = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: '',
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context);
  HTMLCanvasElement.prototype.toBlob = vi.fn(function toBlob(callback) {
    callback(new Blob(['fake-png'], { type: 'image/png' }));
  });
  return context;
}

beforeEach(() => {
  mockCanvas();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete global.ClipboardItem;
});

describe('QrCodeTool placeholder state', () => {
  it('shows a neutral placeholder and draws nothing while input is empty', () => {
    render(<QrCodeTool />);
    expect(screen.getByText(/enter text or a url/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('QrCodeTool real-time regeneration', () => {
  it('regenerates and draws the QR code as the user types', async () => {
    render(<QrCodeTool />);
    fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
      target: { value: 'https://example.com' },
    });

    await waitFor(() => {
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    });
    expect(screen.queryByText(/enter text or a url/i)).not.toBeInTheDocument();
    expect(screen.getByText(/version \d+/i)).toBeInTheDocument();
  });

  it('regenerates again on every further keystroke', async () => {
    render(<QrCodeTool />);
    const input = screen.getByLabelText(/text or url to encode/i);

    fireEvent.change(input, { target: { value: 'a' } });
    await waitFor(() => expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled());
    const callsAfterFirst = HTMLCanvasElement.prototype.getContext.mock.calls.length;

    fireEvent.change(input, { target: { value: 'a longer string of text' } });
    await waitFor(() => {
      expect(HTMLCanvasElement.prototype.getContext.mock.calls.length).toBeGreaterThan(
        callsAfterFirst,
      );
    });
  });
});

describe('QrCodeTool error correction level switching', () => {
  it('regenerates with a new version/meta when the EC level changes', async () => {
    render(<QrCodeTool />);
    fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
      target: { value: '0123456789' },
    });
    await waitFor(() => expect(screen.getByText(/level M/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Error correction level'), {
      target: { value: 'H' },
    });

    await waitFor(() => expect(screen.getByText(/level H/i)).toBeInTheDocument());
  });
});

describe('QrCodeTool capacity error display', () => {
  it('shows an accessible alert without throwing when input exceeds capacity', () => {
    render(<QrCodeTool />);
    const hugeText = 'a'.repeat(5000);

    expect(() => {
      fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
        target: { value: hugeText },
      });
    }).not.toThrow();

    expect(screen.getByRole('alert')).toHaveTextContent(/too long/i);
  });
});

describe('QrCodeTool copy-to-clipboard feedback', () => {
  it('shows success feedback through the aria-live region when copy succeeds', async () => {
    Object.assign(navigator, { clipboard: { write: vi.fn().mockResolvedValue(undefined) } });
    // A regular function (not an arrow function) is required here so `new
    // ClipboardItem(...)` in the component under test is constructible.
    global.ClipboardItem = vi.fn(function ClipboardItem(obj) {
      return obj;
    });

    render(<QrCodeTool />);
    fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
      target: { value: 'hello' },
    });
    await waitFor(() => expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy qr code image to clipboard/i }));
    });

    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it('shows failure feedback through the aria-live region when copy is denied', async () => {
    Object.assign(navigator, {
      clipboard: { write: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    global.ClipboardItem = vi.fn(function ClipboardItem(obj) {
      return obj;
    });

    render(<QrCodeTool />);
    fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
      target: { value: 'hello' },
    });
    await waitFor(() => expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy qr code image to clipboard/i }));
    });

    expect(await screen.findByText(/failed to copy/i)).toBeInTheDocument();
  });
});

describe('QrCodeTool download control', () => {
  it('exposes an accessible download-as-PNG button that renders a blob', async () => {
    render(<QrCodeTool />);
    fireEvent.change(screen.getByLabelText(/text or url to encode/i), {
      target: { value: 'hello' },
    });
    await waitFor(() => expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled());

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    fireEvent.click(screen.getByRole('button', { name: /download qr code as png/i }));

    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});
