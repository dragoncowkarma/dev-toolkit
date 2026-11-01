import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BarcodeGeneratorTool from './BarcodeGeneratorTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BarcodeGeneratorTool', () => {
  it('renders an SVG preview and download actions for valid EAN-13 input', () => {
    render(<BarcodeGeneratorTool />);

    fireEvent.change(screen.getByLabelText('Barcode format'), { target: { value: 'ean13' } });
    fireEvent.change(screen.getByLabelText('Barcode value'), { target: { value: '400638133393' } });

    expect(screen.getByRole('img', { name: /EAN-13 barcode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeInTheDocument();
  });

  it('announces input validation errors', () => {
    render(<BarcodeGeneratorTool />);

    fireEvent.change(screen.getByLabelText('Barcode format'), { target: { value: 'ean13' } });
    fireEvent.change(screen.getByLabelText('Barcode value'), {
      target: { value: 'not-a-barcode' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('12 or 13 digits');
  });

  it('downloads the generated SVG with the SVG MIME type', () => {
    const createObjectUrl = vi.fn(() => 'blob:barcode');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });

    render(<BarcodeGeneratorTool />);
    fireEvent.change(screen.getByLabelText('Barcode value'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download SVG' }));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(createObjectUrl.mock.calls[0][0].type).toBe('image/svg+xml;charset=utf-8');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:barcode');
  });
});
