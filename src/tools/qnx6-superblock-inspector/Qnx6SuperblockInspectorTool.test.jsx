import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Qnx6SuperblockInspectorTool from './Qnx6SuperblockInspectorTool.jsx';
import * as qnx6Utils from './qnx6Superblock.utils.js';
import {
  buildSampleSuperblock,
  bytesToHex,
} from './qnx6Superblock.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Qnx6SuperblockInspectorTool component', () => {
  it('renders tool title, input card and action buttons', () => {
    render(<Qnx6SuperblockInspectorTool />);

    expect(screen.getByText('QNX6 Superblock Inspector')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload disk image or superblock file')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load Sample Superblock' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all inputs' })).toBeDisabled();
    expect(screen.getByLabelText('Superblock Hex Input')).toHaveValue('');
  });

  it('loads sample superblock and displays overview, fields and root node summaries', () => {
    render(<Qnx6SuperblockInspectorTool />);

    const loadBtn = screen.getByRole('button', { name: 'Load Sample Superblock' });
    fireEvent.click(loadBtn);

    expect(screen.getByText('Inspection Overview')).toBeInTheDocument();
    expect(screen.getByText('✓ Valid Superblock')).toBeInTheDocument();
    expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    expect(screen.getByText('✓ CRC32 Match')).toBeInTheDocument();

    // Field cards
    expect(screen.getByText('Magic Number')).toBeInTheDocument();
    expect(screen.getByText('0x68191122')).toBeInTheDocument();
    expect(screen.getByText('Sequence Serial (64-bit)')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Volume ID (UUID)')).toBeInTheDocument();

    // Table
    expect(screen.getByRole('table', { name: 'Root nodes summary' })).toBeInTheDocument();
    expect(screen.getByText('Inode Tree')).toBeInTheDocument();
    expect(screen.getByText('Allocation Bitmap Tree')).toBeInTheDocument();
    expect(screen.getByText('Longfile Tree')).toBeInTheDocument();
  });

  it('updates inspection when valid hex is typed into textarea', async () => {
    const sampleBytes = buildSampleSuperblock({ blockSize: 2048, serial: 9999n });
    const hex = bytesToHex(sampleBytes, true);

    render(<Qnx6SuperblockInspectorTool />);
    const textarea = screen.getByLabelText('Superblock Hex Input');

    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByText('2048 bytes')).toBeInTheDocument();
      expect(screen.getByText('9999')).toBeInTheDocument();
    });
  });

  it('displays input error alert when hex contains invalid characters', async () => {
    render(<Qnx6SuperblockInspectorTool />);
    const textarea = screen.getByLabelText('Superblock Hex Input');

    fireEvent.change(textarea, { target: { value: 'invalid-hex-characters' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid hexadecimal characters in input.'
      );
    });
  });

  it('displays diagnostics when superblock has CRC mismatch', async () => {
    const corruptedBytes = buildSampleSuperblock({ corruptChecksum: true });
    const hex = bytesToHex(corruptedBytes, true);

    render(<Qnx6SuperblockInspectorTool />);
    const textarea = screen.getByLabelText('Superblock Hex Input');

    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Superblock CRC32 mismatch/);
      expect(screen.getByText('✕ CRC32 Mismatch')).toBeInTheDocument();
    });
  });

  it('displays diagnostics when superblock has bad magic', async () => {
    const badMagicBytes = new Uint8Array(512);
    badMagicBytes.fill(0xee);
    const hex = bytesToHex(badMagicBytes, true);

    render(<Qnx6SuperblockInspectorTool />);
    const textarea = screen.getByLabelText('Superblock Hex Input');

    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Invalid QNX6 superblock magic/
      );
    });
  });

  it('displays diagnostics when input is truncated', async () => {
    const shortBytes = new Uint8Array(100);
    const hex = bytesToHex(shortBytes, true);

    render(<Qnx6SuperblockInspectorTool />);
    const textarea = screen.getByLabelText('Superblock Hex Input');

    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Truncated input \(100 bytes\)/
      );
    });
  });

  it('reads uploaded file slice and displays results', async () => {
    const sampleBytes = buildSampleSuperblock({ blockSize: 4096 });
    const file = new File([sampleBytes], 'qnx6_disk.img', {
      type: 'application/octet-stream',
    });

    render(<Qnx6SuperblockInspectorTool />);
    const fileInput = screen.getByLabelText('Upload disk image or superblock file');

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput);
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded: qnx6_disk.img/)).toBeInTheDocument();
      expect(screen.getByText('4096 bytes')).toBeInTheDocument();
    });
  });

  it('clears all inputs and resets state when Clear is clicked', () => {
    render(<Qnx6SuperblockInspectorTool />);
    const loadBtn = screen.getByRole('button', { name: 'Load Sample Superblock' });
    fireEvent.click(loadBtn);

    expect(screen.getByText('Inspection Overview')).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: 'Clear all inputs' });
    expect(clearBtn).not.toBeDisabled();

    fireEvent.click(clearBtn);

    expect(screen.queryByText('Inspection Overview')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Superblock Hex Input')).toHaveValue('');
    expect(clearBtn).toBeDisabled();
  });

  it('ignores obsolete file read on out-of-order success', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    const firstBytes = buildSampleSuperblock({ serial: 1111n });
    const secondBytes = buildSampleSuperblock({ serial: 2222n });

    await act(async () => {
      resolveSecond(secondBytes);
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded: second\.img/)).toBeInTheDocument();
      expect(screen.getByText('2222')).toBeInTheDocument();
    });

    await act(async () => {
      resolveFirst(firstBytes);
    });

    expect(screen.getByText(/Loaded: second\.img/)).toBeInTheDocument();
    expect(screen.getByText('2222')).toBeInTheDocument();
    expect(screen.queryByText(/Loaded: first\.img/)).not.toBeInTheDocument();
    expect(screen.queryByText('1111')).not.toBeInTheDocument();
  });

  it('ignores obsolete file read error on out-of-order failure', async () => {
    let rejectFirst;
    const firstPromise = new Promise((_, reject) => {
      rejectFirst = reject;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    const secondBytes = buildSampleSuperblock({ serial: 3333n });

    await act(async () => {
      resolveSecond(secondBytes);
    });

    await waitFor(() => {
      expect(screen.getByText(/Loaded: second\.img/)).toBeInTheDocument();
      expect(screen.getByText('3333')).toBeInTheDocument();
    });

    await act(async () => {
      rejectFirst(new Error('First read disk error'));
    });

    expect(screen.getByText(/Loaded: second\.img/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores obsolete file read success when a newer file read fails', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let rejectSecond;
    const secondPromise = new Promise((_, reject) => {
      rejectSecond = reject;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    await act(async () => {
      rejectSecond(new Error('Corrupt second image'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Corrupt second image');
    });

    const firstBytes = buildSampleSuperblock({ serial: 4444n });

    await act(async () => {
      resolveFirst(firstBytes);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Corrupt second image');
    expect(screen.queryByText('4444')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded: first\.img/)).not.toBeInTheDocument();
  });

  it('ignores pending file read when Clear is clicked', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice').mockReturnValueOnce(firstPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    const clearBtn = screen.getByRole('button', { name: 'Clear all inputs' });
    fireEvent.click(clearBtn);

    const sampleBytes = buildSampleSuperblock({ serial: 5555n });

    await act(async () => {
      resolveFirst(sampleBytes);
    });

    expect(screen.queryByText('5555')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded: delayed\.img/)).not.toBeInTheDocument();
    expect(screen.queryByText('Inspection Overview')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Superblock Hex Input')).toHaveValue('');
  });

  it('ignores pending file read when Load Sample is clicked', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice').mockReturnValueOnce(firstPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample Superblock' }));

    await waitFor(() => {
      expect(screen.getByText('Inspection Overview')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    const delayedBytes = buildSampleSuperblock({ serial: 6666n });

    await act(async () => {
      resolveFirst(delayedBytes);
    });

    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText('6666')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded: delayed\.img/)).not.toBeInTheDocument();
  });

  it('ignores pending file read when hex input is manually edited', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(qnx6Utils, 'readSuperblockSlice').mockReturnValueOnce(firstPromise);

    render(<Qnx6SuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload disk image or superblock file');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    const manualBytes = buildSampleSuperblock({ serial: 7777n });
    const manualHex = bytesToHex(manualBytes, true);

    const textarea = screen.getByLabelText('Superblock Hex Input');
    fireEvent.change(textarea, { target: { value: manualHex } });

    await waitFor(() => {
      expect(screen.getByText('7777')).toBeInTheDocument();
    });

    const delayedBytes = buildSampleSuperblock({ serial: 8888n });

    await act(async () => {
      resolveFirst(delayedBytes);
    });

    expect(screen.getByText('7777')).toBeInTheDocument();
    expect(screen.queryByText('8888')).not.toBeInTheDocument();
    expect(screen.queryByText(/Loaded: delayed\.img/)).not.toBeInTheDocument();
  });
});
