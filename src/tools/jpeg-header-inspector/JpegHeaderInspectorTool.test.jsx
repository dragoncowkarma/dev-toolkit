import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import JpegHeaderInspectorTool from './JpegHeaderInspectorTool.jsx';
import * as jpegUtils from './jpeg.utils.js';

beforeAll(() => {
  if (typeof File.prototype.arrayBuffer !== 'function') {
    File.prototype.arrayBuffer = function arrayBuffer() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JpegHeaderInspectorTool UI', () => {
  it('renders initial empty state with file select and sample buttons', () => {
    render(<JpegHeaderInspectorTool />);

    expect(
      screen.getByRole('button', { name: 'Load Sample JPEG' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Select JPEG File')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(screen.getByText(/Select a local JPEG image/i)).toBeInTheDocument();
  });

  it('loads and displays sample JPEG data with summary and segments table', () => {
    render(<JpegHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample JPEG' }));

    // Summary card checks
    expect(screen.getByLabelText('JPEG Summary')).toBeInTheDocument();
    expect(screen.getByText('64 × 64 px')).toBeInTheDocument();
    expect(screen.getAllByText(/72 × 72/)[0]).toBeInTheDocument();
    expect(screen.getByText('7 segments')).toBeInTheDocument();

    // Table checks
    const table = screen.getByLabelText('JPEG Segments Table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('APP0/JFIF')).toBeInTheDocument();
    expect(screen.getByText('DQT')).toBeInTheDocument();
    expect(screen.getByText('SOF0')).toBeInTheDocument();
    expect(screen.getByText('DHT')).toBeInTheDocument();
    expect(screen.getByText('SOS')).toBeInTheDocument();
    expect(screen.getByText('EOI')).toBeInTheDocument();

    // Clear button should now be enabled
    expect(screen.getByRole('button', { name: 'Clear' })).not.toBeDisabled();
  });

  it('clears displayed results when Clear button is clicked', () => {
    render(<JpegHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample JPEG' }));
    expect(screen.getByLabelText('JPEG Summary')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByLabelText('JPEG Summary')).not.toBeInTheDocument();
    expect(screen.getByText(/Select a local JPEG image/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('parses an uploaded valid JPEG file', async () => {
    render(<JpegHeaderInspectorTool />);

    const sampleBuffer = jpegUtils.createSampleJpeg();
    const file = new File([sampleBuffer], 'custom.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByText(/custom\.jpg/)).toBeInTheDocument();
      expect(screen.getByLabelText('JPEG Summary')).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays a visible role="alert" when uploading malformed file', async () => {
    render(<JpegHeaderInspectorTool />);

    const malformed = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
    const file = new File([malformed], 'not-a-jpeg.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/missing SOI marker/i);
    expect(screen.queryByLabelText('JPEG Summary')).not.toBeInTheDocument();
  });

  it('displays a visible role="alert" when uploading truncated JPEG file', async () => {
    render(<JpegHeaderInspectorTool />);

    const truncated = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x01]);
    const file = new File([truncated], 'truncated.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Truncated segment/i);
  });

  it('displays a visible role="alert" when uploading undersized SOS payload', async () => {
    render(<JpegHeaderInspectorTool />);

    // Exact byte sequence from review: FF D8 FF DA 00 02 FF D9
    const undersizedSos = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xDA, 0x00, 0x02,
      0xFF, 0xD9,
    ]);
    const file = new File([undersizedSos], 'corrupt-sos.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Truncated SOS segment/i);
    expect(screen.queryByLabelText('JPEG Summary')).not.toBeInTheDocument();
  });

  it('displays a visible role="alert" when marker length is invalid (< 2)', async () => {
    render(<JpegHeaderInspectorTool />);

    const invalid = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x01]);
    const file = new File([invalid], 'invalid-len.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid marker length/i);
  });

  it('displays a visible role="alert" on file-read failure', async () => {
    vi.spyOn(jpegUtils, 'readJpegFile').mockRejectedValueOnce(
      new Error('Disk read failure'),
    );

    render(<JpegHeaderInspectorTool />);

    const file = new File(['mock'], 'corrupt.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');

    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Disk read failure');
  });

  it('ignores a stale file read that resolves after Clear is clicked', async () => {
    const deferred = createDeferred();
    vi.spyOn(jpegUtils, 'readJpegFile').mockReturnValueOnce(deferred.promise);

    render(<JpegHeaderInspectorTool />);

    const file = new File(['data'], 'delayed.jpg', { type: 'image/jpeg' });
    const fileInput = screen.getByLabelText('Select JPEG File');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve(jpegUtils.createSampleJpeg());
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('JPEG Summary')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
