import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GptPartitionTableInspectorTool from './GptPartitionTableInspectorTool.jsx';
import { bytesToHex, crc32, createSampleGptBytes } from './gpt.utils.js';

function create4KnTruncatedGptBytes() {
  const buffer = new Uint8Array(17408);
  const view = new DataView(buffer.buffer);
  buffer[510] = 0x55;
  buffer[511] = 0xAA;

  const sig = [0x45, 0x46, 0x49, 0x20, 0x50, 0x41, 0x52, 0x54];
  sig.forEach((b, i) => { buffer[4096 + i] = b; });
  view.setUint32(4096 + 8, 0x00010000, true);
  view.setUint32(4096 + 12, 92, true);
  view.setBigUint64(4096 + 24, 1n, true);
  view.setBigUint64(4096 + 32, 204799n, true);
  view.setBigUint64(4096 + 40, 34n, true);
  view.setBigUint64(4096 + 48, 204766n, true);
  view.setBigUint64(4096 + 72, 2n, true);
  view.setUint32(4096 + 80, 128, true);
  view.setUint32(4096 + 84, 128, true);
  view.setUint32(4096 + 88, 0x12345678, true);

  const headerCopy = new Uint8Array(buffer.subarray(4096, 4096 + 92));
  headerCopy[16] = 0;
  headerCopy[17] = 0;
  headerCopy[18] = 0;
  headerCopy[19] = 0;
  view.setUint32(4096 + 16, crc32(headerCopy), true);
  return buffer;
}

afterEach(() => {
  cleanup();
});

describe('GptPartitionTableInspectorTool UI', () => {
  it('renders initial file upload dropzone', () => {
    render(<GptPartitionTableInspectorTool />);

    expect(screen.getByRole('radio', { name: 'File Upload' })).toHaveClass('active');
    expect(screen.getByText('Select or drop disk image file')).toBeInTheDocument();
  });

  it('switches to Paste Hex mode and parses sample GPT on click', async () => {
    render(<GptPartitionTableInspectorTool />);

    const sampleBtn = screen.getByRole('button', { name: 'Load Sample GPT' });
    fireEvent.click(sampleBtn);

    expect(screen.getByRole('radio', { name: 'Paste Hex' })).toHaveClass('active');
    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
      expect(screen.getByText('EFI PART - Valid Header')).toBeInTheDocument();
      expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
      expect(screen.getByText('#2 Basic Data')).toBeInTheDocument();
    });
  });

  it('displays error on invalid hex input', async () => {
    render(<GptPartitionTableInspectorTool />);

    fireEvent.click(screen.getByRole('radio', { name: 'Paste Hex' }));
    const textarea = screen.getByPlaceholderText(/Paste raw hex data/);

    fireEvent.change(textarea, { target: { value: '1234567890abcdef' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Truncated input/)).toBeInTheDocument();
    });
  });

  it('handles valid file upload', async () => {
    render(<GptPartitionTableInspectorTool />);

    const sampleBytes = createSampleGptBytes();
    const file = new File([sampleBytes], 'disk.img', { type: 'application/octet-stream' });
    const input = screen.getByLabelText('Upload disk image file');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
      expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
      expect(screen.getByText(/disk\.img/)).toBeInTheDocument();
    });
  });

  it('clears state when Clear button is clicked', async () => {
    render(<GptPartitionTableInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample GPT' }));
    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText('GPT Header (LBA 1)')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste raw hex data/)).toHaveValue('');
  });

  it('marks partition list incomplete for 4Kn GPT without false empty claim', async () => {
    render(<GptPartitionTableInspectorTool />);

    const bytes = create4KnTruncatedGptBytes();
    const hex = bytesToHex(bytes);

    fireEvent.click(screen.getByRole('radio', { name: 'Paste Hex' }));
    const textarea = screen.getByPlaceholderText(/Paste raw hex data/);
    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByText('GPT Header (LBA 1)')).toBeInTheDocument();
      expect(screen.getByText('List Incomplete')).toBeInTheDocument();
      expect(
        screen.getByText('Partition Entries (0 active scanned, incomplete)')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Partition entry array is truncated by the 34-sector read limit/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No active partitions found in the first 72 inspected entries/)
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/all entries are zero/)
      ).not.toBeInTheDocument();
    });
  });

  it('handles out-of-order file read completion by ignoring stale reads', async () => {
    render(<GptPartitionTableInspectorTool />);

    let resolveFile1;
    let resolveFile2;
    const p1 = new Promise((resolve) => { resolveFile1 = resolve; });
    const p2 = new Promise((resolve) => { resolveFile2 = resolve; });

    const file1 = new File(['file1-data'], 'disk1.img', { type: 'application/octet-stream' });
    file1.slice = () => ({ arrayBuffer: () => p1 });

    const file2 = new File(['file2-data'], 'disk2.img', { type: 'application/octet-stream' });
    file2.slice = () => ({ arrayBuffer: () => p2 });

    const input = screen.getByLabelText('Upload disk image file');

    // Trigger file1 then file2 before file1 completes
    await act(async () => {
      fireEvent.change(input, { target: { files: [file1] } });
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file2] } });
    });

    const sampleBytes = createSampleGptBytes();
    // Resolve file2 first
    await act(async () => {
      resolveFile2(sampleBytes.buffer);
    });

    await waitFor(() => {
      expect(screen.getByText('disk2.img (10 B)')).toBeInTheDocument();
      expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
    });

    // Resolve file1 second with invalid bytes
    await act(async () => {
      resolveFile1(new Uint8Array(100).buffer);
    });

    // Verify file2 remains displayed and stale file1 was discarded
    expect(screen.getByText('disk2.img (10 B)')).toBeInTheDocument();
    expect(screen.getByText('#1 EFI System')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('invalidates pending file read when Clear is clicked', async () => {
    render(<GptPartitionTableInspectorTool />);

    let resolveFile;
    const p = new Promise((resolve) => { resolveFile = resolve; });
    const file = new File(['data'], 'test.img', { type: 'application/octet-stream' });
    file.slice = () => ({ arrayBuffer: () => p });

    const input = screen.getByLabelText('Upload disk image file');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const sampleBytes = createSampleGptBytes();
    await act(async () => {
      resolveFile(sampleBytes.buffer);
    });

    expect(screen.queryByText('GPT Header (LBA 1)')).not.toBeInTheDocument();
    expect(screen.queryByText('test.img')).not.toBeInTheDocument();
  });

  it('invalidates pending file read when switching mode to Paste Hex', async () => {
    render(<GptPartitionTableInspectorTool />);

    let resolveFile;
    const p = new Promise((resolve) => { resolveFile = resolve; });
    const file = new File(['data'], 'test.img', { type: 'application/octet-stream' });
    file.slice = () => ({ arrayBuffer: () => p });

    const input = screen.getByLabelText('Upload disk image file');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    fireEvent.click(screen.getByRole('radio', { name: 'Paste Hex' }));

    const sampleBytes = createSampleGptBytes();
    await act(async () => {
      resolveFile(sampleBytes.buffer);
    });

    expect(screen.queryByText('GPT Header (LBA 1)')).not.toBeInTheDocument();
  });
});
