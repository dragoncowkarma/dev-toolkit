import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Woff2HeaderInspectorTool from './Woff2HeaderInspectorTool.jsx';
import * as utils from './woff2-header-inspector.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('Woff2HeaderInspectorTool', () => {
  it('renders initial UI in Hex mode and automatically parses the sample header', () => {
    render(<Woff2HeaderInspectorTool />);

    expect(screen.getByRole('button', { name: 'Hex' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Hex Bytes/i)).toBeInTheDocument();

    // Summary cards
    expect(screen.getAllByText('wOF2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/TrueType outlines/i).length).toBeGreaterThanOrEqual(1);

    // Table
    expect(screen.getByRole('table', { name: 'WOFF2 Header Fields Table' })).toBeInTheDocument();
  });

  it('switches between Hex, Base64, and File Upload modes', () => {
    render(<Woff2HeaderInspectorTool />);

    // Switch to Base64
    fireEvent.click(screen.getByRole('button', { name: 'Base64' }));
    expect(screen.getByRole('button', { name: 'Base64' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Base64 Encoded WOFF2/i)).toBeInTheDocument();

    // Switch to File Upload
    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    expect(screen.getByRole('button', { name: 'File Upload' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText(/Upload WOFF2 font file/i)).toBeInTheDocument();
  });

  it('loads sample header in Base64 mode when "Load Sample" is clicked', () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Base64' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    const textarea = screen.getByLabelText(/Base64 Encoded WOFF2/i);
    expect(textarea.value).toBe(utils.SAMPLE_WOFF2_BASE64);
    expect(screen.getAllByText('wOF2').length).toBeGreaterThanOrEqual(1);
  });

  it('clears input and results when "Clear" is clicked', () => {
    render(<Woff2HeaderInspectorTool />);

    expect(screen.getAllByText('wOF2').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText(/Hex Bytes/i)).toHaveValue('');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays a non-crashing alert error on truncated hex (<48 bytes)', () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.change(screen.getByLabelText(/Hex Bytes/i), {
      target: { value: '77 4F 46 32 00 01' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Truncated header: expected at least 48 bytes/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('displays a non-crashing alert error on invalid magic signature', () => {
    render(<Woff2HeaderInspectorTool />);

    // 48 bytes of zeros (signature 0x00000000)
    const badHex = '00 '.repeat(48).trim();
    fireEvent.change(screen.getByLabelText(/Hex Bytes/i), {
      target: { value: badHex },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Invalid WOFF2 signature: expected "wOF2"/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('displays a descriptive alert error on invalid hex syntax', () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.change(screen.getByLabelText(/Hex Bytes/i), {
      target: { value: 'invalid-hex-chars' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Hex string/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('displays error when Base64 is invalid', () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Base64' }));
    fireEvent.change(screen.getByLabelText(/Base64 Encoded WOFF2/i), {
      target: { value: 'not-base64!' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Invalid Base64 input/);
  });

  it('inspects an uploaded WOFF2 file', async () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const sampleBytes = utils.createSampleWoff2Header({ numTables: 14 });
    const file = new File([sampleBytes], 'custom.woff2', { type: 'font/woff2' });

    const fileInput = screen.getByLabelText(/Upload WOFF2 font file/i);
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByText('📁 custom.woff2 (48 B)')).toBeInTheDocument();
      expect(screen.getByText('14 tables')).toBeInTheDocument();
    });
  });

  it('handles file read failures gracefully in UI', async () => {
    vi.spyOn(utils, 'fileToBytes').mockRejectedValueOnce(new Error('Cannot read file'));

    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const file = new File(['short'], 'broken.woff2', { type: 'font/woff2' });

    const fileInput = screen.getByLabelText(/Upload WOFF2 font file/i);
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot read file');
    });
  });

  it('ignores older file reads if user clears while reading', async () => {
    let resolvePromise;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.spyOn(utils, 'fileToBytes').mockReturnValueOnce(promise);

    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const file = new File(['dummy'], 'test.woff2', { type: 'font/woff2' });

    const fileInput = screen.getByLabelText(/Upload WOFF2 font file/i);
    selectFile(fileInput, file);

    // User clears before file resolves
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      resolvePromise(utils.createSampleWoff2Header());
      await Promise.resolve();
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears results and keeps read error when a second file read fails', async () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const fileInput = screen.getByLabelText(/Upload WOFF2 font file/i);

    const firstFile = new File([utils.createSampleWoff2Header({ numTables: 14 })], 'first.woff2', {
      type: 'font/woff2',
    });
    await act(async () => selectFile(fileInput, firstFile));

    await waitFor(() => {
      expect(screen.getByText('📁 first.woff2 (48 B)')).toBeInTheDocument();
      expect(screen.getByText('14 tables')).toBeInTheDocument();
    });

    vi.spyOn(utils, 'fileToBytes').mockRejectedValueOnce(new Error('Disk read failed'));
    const secondFile = new File(['bad'], 'second.woff2', { type: 'font/woff2' });
    await act(async () => selectFile(fileInput, secondFile));

    await waitFor(() => {
      expect(screen.getByText('📁 second.woff2 (3 B)')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Disk read failed');
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('clears previous results while a second file read is pending', async () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const fileInput = screen.getByLabelText(/Upload WOFF2 font file/i);

    const firstFile = new File([utils.createSampleWoff2Header({ numTables: 14 })], 'first.woff2', {
      type: 'font/woff2',
    });
    await act(async () => selectFile(fileInput, firstFile));

    await waitFor(() => {
      expect(screen.getByText('14 tables')).toBeInTheDocument();
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    vi.spyOn(utils, 'fileToBytes').mockReturnValueOnce(secondPromise);

    const secondFile = new File(
      [utils.createSampleWoff2Header({ numTables: 22 })],
      'second.woff2',
      { type: 'font/woff2' },
    );
    selectFile(fileInput, secondFile);

    // While pending, new filename shows loading state and previous header is cleared
    expect(screen.getByText(/second\.woff2.*Reading/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('14 tables')).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond(utils.createSampleWoff2Header({ numTables: 22 }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('📁 second.woff2 (48 B)')).toBeInTheDocument();
      expect(screen.getByText('22 tables')).toBeInTheDocument();
    });
  });

  it('handles drag-over and inspects a dropped WOFF2 file on the dropzone', async () => {
    render(<Woff2HeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const dropzone = screen.getByTestId('woff2-file-dropzone');

    const dragOverEvent = createEvent.dragOver(dropzone);
    fireEvent(dropzone, dragOverEvent);
    expect(dragOverEvent.defaultPrevented).toBe(true);
    expect(dropzone).toHaveClass('is-dragging');

    const droppedFile = new File(
      [utils.createSampleWoff2Header({ numTables: 18 })],
      'dropped.woff2',
      { type: 'font/woff2' },
    );
    const dropEvent = createEvent.drop(dropzone, {
      dataTransfer: { files: [droppedFile] },
    });
    await act(async () => {
      fireEvent(dropzone, dropEvent);
    });

    expect(dropEvent.defaultPrevented).toBe(true);
    expect(dropzone).not.toHaveClass('is-dragging');

    await waitFor(() => {
      expect(screen.getByText('📁 dropped.woff2 (48 B)')).toBeInTheDocument();
      expect(screen.getByText('18 tables')).toBeInTheDocument();
    });
  });
});
