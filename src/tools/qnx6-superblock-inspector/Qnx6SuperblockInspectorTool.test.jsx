import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Qnx6SuperblockInspectorTool from './Qnx6SuperblockInspectorTool.jsx';
import {
  buildSampleSuperblock,
  bytesToHex,
} from './qnx6Superblock.utils.js';

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
});
