import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import UbifsSuperblockInspectorTool from './UbifsSuperblockInspectorTool.jsx';
import { createMockUbifsSuperblock } from './ubifsSuperblockInspector.utils.js';

afterEach(() => {
  cleanup();
});

describe('UbifsSuperblockInspectorTool', () => {
  it('renders upload prompt and file input', () => {
    render(<UbifsSuperblockInspectorTool />);
    expect(screen.getByText('Choose UBIFS Image')).toBeInTheDocument();
    expect(screen.getByTestId('ubifs-file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('ubifs-results')).not.toBeInTheDocument();
  });

  it('parses and displays valid superblock when file is uploaded', async () => {
    const mockData = createMockUbifsSuperblock({
      sqnum: 12345n,
      minIoSize: 4096,
      lebSize: 262144,
      lebCnt: 500,
      uuidBytes: [
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11,
        0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99,
      ],
    });
    const file = new File([mockData], 'ubifs.img', { type: 'application/octet-stream' });

    render(<UbifsSuperblockInspectorTool />);
    const input = screen.getByTestId('ubifs-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('ubifs-results')).toBeInTheDocument();
    });

    expect(screen.getByText('0x06101831')).toBeInTheDocument();
    expect(screen.getByText('12345')).toBeInTheDocument();
    expect(screen.getAllByText('4096 bytes')).toHaveLength(2);
    expect(screen.getByText('262144 bytes')).toBeInTheDocument();
    expect(screen.getByText('aabbccdd-eeff-0011-2233-445566778899')).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('Loaded: ubifs.img')).toBeInTheDocument();
  });

  it('displays error on bad magic', async () => {
    const badData = createMockUbifsSuperblock({ magic: 0x99999999 });
    const file = new File([badData], 'bad_magic.img', { type: 'application/octet-stream' });

    render(<UbifsSuperblockInspectorTool />);
    const input = screen.getByTestId('ubifs-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('ubifs-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/Invalid UBIFS magic/i)).toBeInTheDocument();
    expect(screen.queryByTestId('ubifs-results')).not.toBeInTheDocument();
  });

  it('displays error on truncated file', async () => {
    const truncated = new Uint8Array(20);
    const file = new File([truncated], 'truncated.img', { type: 'application/octet-stream' });

    render(<UbifsSuperblockInspectorTool />);
    const input = screen.getByTestId('ubifs-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('ubifs-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('ubifs-error')).toHaveTextContent(/truncated/i);
  });

  it('displays CRC mismatch status when payload is corrupted', async () => {
    const corruptData = createMockUbifsSuperblock();
    corruptData[200] ^= 0xff;
    const file = new File([corruptData], 'corrupt_crc.img', {
      type: 'application/octet-stream',
    });

    render(<UbifsSuperblockInspectorTool />);
    const input = screen.getByTestId('ubifs-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('ubifs-results')).toBeInTheDocument();
    });

    expect(screen.getByText('Mismatch')).toBeInTheDocument();
  });

  it('displays 64-bit values above 2^53 correctly in the UI', async () => {
    const hugeSqnum = 9007199254740995n; // 2^53 + 3
    const data = createMockUbifsSuperblock({ sqnum: hugeSqnum });
    const file = new File([data], 'huge64.img', { type: 'application/octet-stream' });

    render(<UbifsSuperblockInspectorTool />);
    const input = screen.getByTestId('ubifs-file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('ubifs-results')).toBeInTheDocument();
    });

    expect(screen.getByText('9007199254740995')).toBeInTheDocument();
  });
});
