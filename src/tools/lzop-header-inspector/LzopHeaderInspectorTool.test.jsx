import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LzopHeaderInspectorTool from './LzopHeaderInspectorTool.jsx';
import * as lzopUtils from './lzop-header-inspector.utils.js';
import {
  buildLzopHeader,
  bytesToHex,
} from './lzop-header-inspector.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('LzopHeaderInspectorTool UI', () => {
  it('renders tool title and default upload dropzone', () => {
    render(<LzopHeaderInspectorTool />);
    expect(screen.getByRole('tab', { name: 'File Upload' })).toHaveClass('active');
    expect(
      screen.getByText('Drop an LZOP (.lzo) file here or click to browse')
    ).toBeInTheDocument();
  });

  it('loads sample header and displays parsed details', () => {
    render(<LzopHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();
    expect(screen.getByText('Selected File:')).toBeInTheDocument();
    expect(screen.getByText('sample.lzo')).toBeInTheDocument();
    expect(screen.getByText('example.tar')).toBeInTheDocument();
    expect(screen.getByText('LZO1X-1 (1)')).toBeInTheDocument();
    expect(screen.getAllByText('Level 3').length).toBeGreaterThan(0);
  });

  it('handles valid file upload and displays actual file size', async () => {
    render(<LzopHeaderInspectorTool />);
    const headerBytes = buildLzopHeader({ fileName: 'uploaded.tar' });
    // Simulate a large 2.5 MB archive where header is only first 46 bytes
    const simulatedFileBytes = new Uint8Array(2.5 * 1024 * 1024);
    simulatedFileBytes.set(headerBytes, 0);

    const file = new File([simulatedFileBytes], 'archive.lzo', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Upload LZOP file');

    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByText('archive.lzo')).toBeInTheDocument();
      expect(screen.getByText(/2.5 MB/)).toBeInTheDocument();
      expect(screen.getByText('uploaded.tar')).toBeInTheDocument();
    });
  });

  it('shows clear error and resets header state on bad magic file', async () => {
    render(<LzopHeaderInspectorTool />);
    // First load sample
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();

    // Now upload invalid file
    const badFile = new File(['not an lzo file'], 'bad.lzo', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Upload LZOP file');

    await act(async () => selectFile(fileInput, badFile));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Invalid LZOP magic signature/);
      expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();
    });
  });

  it('shows clear error on truncated header file and resets state', async () => {
    render(<LzopHeaderInspectorTool />);
    const truncatedFile = new File([new Uint8Array([0x89, 0x4c])], 'short.lzo', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Upload LZOP file');

    await act(async () => selectFile(fileInput, truncatedFile));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Truncated LZOP header/);
      expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();
    });
  });

  it('supports drag and drop file upload', async () => {
    render(<LzopHeaderInspectorTool />);
    const headerBytes = buildLzopHeader({ fileName: 'dropped.txt' });
    const file = new File([headerBytes], 'dropped.lzo', { type: 'application/octet-stream' });

    const dropzone = screen.getByRole('region', { name: 'File dropzone' });
    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('drag-active');

    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('drag-active');

    await act(async () => {
      fireEvent.drop(dropzone, {
        dataTransfer: { files: [file] },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('dropped.txt')).toBeInTheDocument();
    });
  });

  it('resets state when Clear button is clicked', () => {
    render(<LzopHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected File:')).not.toBeInTheDocument();
  });

  it('switches to Hex Input mode and parses hex input', async () => {
    render(<LzopHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('tab', { name: 'Hex Input' }));

    const textarea = screen.getByLabelText('Hex Encoded LZOP Header Bytes');
    expect(textarea).toBeInTheDocument();

    const sampleHeader = buildLzopHeader({ fileName: 'hex_test.dat' });
    const hex = bytesToHex(sampleHeader);

    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();
      expect(screen.getByText('hex_test.dat')).toBeInTheDocument();
    });

    // Invalid hex error
    fireEvent.change(textarea, { target: { value: '89 4C 5A' } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Truncated LZOP header/);
      expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();
    });
  });

  it('handles upload of a valid header exceeding the initial slice size', async () => {
    render(<LzopHeaderInspectorTool />);
    const extraData = new Uint8Array(65536 + 256);
    extraData.fill(0x33);
    const headerBytes = buildLzopHeader({
      fileName: 'giant_extra.bin',
      extraFieldData: extraData,
    });
    const file = new File([headerBytes], 'giant_extra.lzo', {
      type: 'application/octet-stream',
    });
    const fileInput = screen.getByLabelText('Upload LZOP file');

    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByText('giant_extra.lzo')).toBeInTheDocument();
      expect(screen.getByText('giant_extra.bin')).toBeInTheDocument();
      expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Extra Field' })).toBeInTheDocument();
      expect(screen.getByText('65792 bytes')).toBeInTheDocument();
      expect(screen.getByText(/preview limited to first 512 of 65,792 bytes/)).toBeInTheDocument();
    });
  });

  it('ignores stale file-read on newer selection (out of order)', async () => {
    render(<LzopHeaderInspectorTool />);
    const fileInput = screen.getByLabelText('Upload LZOP file');

    let resolveFileA;
    const promiseA = new Promise((resolve) => {
      resolveFileA = resolve;
    });
    let resolveFileB;
    const promiseB = new Promise((resolve) => {
      resolveFileB = resolve;
    });

    const headerA = buildLzopHeader({ fileName: 'file_a.txt' });
    const headerB = buildLzopHeader({ fileName: 'file_b.txt' });

    const fileA = new File([headerA], 'a.lzo', { type: 'application/octet-stream' });
    const fileB = new File([headerB], 'b.lzo', { type: 'application/octet-stream' });

    vi.spyOn(lzopUtils, 'readHeaderSlice')
      .mockReturnValueOnce(promiseA)
      .mockReturnValueOnce(promiseB);

    // Select file A
    await act(async () => selectFile(fileInput, fileA));
    expect(screen.getByText('a.lzo')).toBeInTheDocument();
    expect(screen.queryByText('file_a.txt')).not.toBeInTheDocument();

    // Select file B before file A resolves
    await act(async () => selectFile(fileInput, fileB));
    expect(screen.getByText('b.lzo')).toBeInTheDocument();

    // Now resolve file B first
    await act(async () => {
      resolveFileB(headerB);
    });

    await waitFor(() => {
      expect(screen.getByText('file_b.txt')).toBeInTheDocument();
      expect(screen.getByText('✓ Valid Signature')).toBeInTheDocument();
    });

    // Now file A completes late (out of order)
    await act(async () => {
      resolveFileA(headerA);
    });

    // Confirm file B is still shown and file A did NOT overwrite it
    expect(screen.getByText('b.lzo')).toBeInTheDocument();
    expect(screen.getByText('file_b.txt')).toBeInTheDocument();
    expect(screen.queryByText('a.lzo')).not.toBeInTheDocument();
    expect(screen.queryByText('file_a.txt')).not.toBeInTheDocument();
  });

  it('ignores pending file-read when Clear is clicked', async () => {
    render(<LzopHeaderInspectorTool />);
    const fileInput = screen.getByLabelText('Upload LZOP file');

    let resolveFile;
    const pendingPromise = new Promise((resolve) => {
      resolveFile = resolve;
    });

    const header = buildLzopHeader({ fileName: 'cleared_target.txt' });
    const file = new File([header], 'pending.lzo', { type: 'application/octet-stream' });

    vi.spyOn(lzopUtils, 'readHeaderSlice').mockReturnValueOnce(pendingPromise);

    await act(async () => selectFile(fileInput, file));
    expect(screen.getByText('pending.lzo')).toBeInTheDocument();

    // User clicks Clear while read is in flight
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('pending.lzo')).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();

    // Now late completion arrives
    await act(async () => {
      resolveFile(header);
    });

    // Tool should remain cleared
    expect(screen.queryByText('pending.lzo')).not.toBeInTheDocument();
    expect(screen.queryByText('cleared_target.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('✓ Valid Signature')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores pending file read when Mode changes or Load Sample is clicked', async () => {
    render(<LzopHeaderInspectorTool />);
    const fileInput = screen.getByLabelText('Upload LZOP file');

    let resolveFile;
    const pendingPromise = new Promise((resolve) => {
      resolveFile = resolve;
    });

    const header = buildLzopHeader({ fileName: 'pending_mode.txt' });
    const file = new File([header], 'pending_mode.lzo', { type: 'application/octet-stream' });

    vi.spyOn(lzopUtils, 'readHeaderSlice').mockReturnValueOnce(pendingPromise);

    await act(async () => selectFile(fileInput, file));

    // User loads sample during read
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(screen.getByText('sample.lzo')).toBeInTheDocument();
    expect(screen.getByText('example.tar')).toBeInTheDocument();

    // Late completion resolves
    await act(async () => {
      resolveFile(header);
    });

    // Sample remains displayed
    expect(screen.getByText('sample.lzo')).toBeInTheDocument();
    expect(screen.getByText('example.tar')).toBeInTheDocument();
    expect(screen.queryByText('pending_mode.txt')).not.toBeInTheDocument();
  });
});
