import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Lvm2PvInspectorTool from './Lvm2PvInspectorTool.jsx';
import { lvmCrc, parseLvm2 } from './lvm2.utils.js';

function fixture() {
  const bytes = new Uint8Array(2048);
  const view = new DataView(bytes.buffer);
  const start = 512;
  const write = (offset, text) => bytes.set(new TextEncoder().encode(text), start + offset);
  write(0, 'LABELONE');
  view.setBigUint64(start + 8, 1n, true);
  view.setUint32(start + 20, 32, true);
  write(24, 'LVM2 001');
  write(32, 'abcdefghijklmnopqrstuvwxyz123456');
  view.setBigUint64(start + 64, 12345678901234567n, true);
  view.setBigUint64(start + 72, 4096n, true);
  view.setBigUint64(start + 80, 8192n, true);
  view.setBigUint64(start + 104, 1024n, true);
  view.setBigUint64(start + 112, 2048n, true);
  view.setUint32(start + 16, 0xf60a43ca, true);
  return bytes;
}

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

function submit(bytes) {
  fireEvent.change(screen.getByLabelText('Hexadecimal input'), { target: { value: toHex(bytes) } });
  fireEvent.click(screen.getByText('Inspect hex'));
}

afterEach(cleanup);

describe('LVM2 inspector', () => {
  it('matches the LVM2 CRC for a fixed fixture', () => {
    expect(lvmCrc(fixture().subarray(532, 1024))).toBe(0xf60a43ca);
  });
  it('parses a label and both lists, preserving 64-bit values', () => {
    const result = parseLvm2(fixture());
    expect(result).toMatchObject({
      sectorIndex: 1, sectorNumber: '1', dataOffset: 32, type: 'LVM2 001',
      uuid: 'abcdef-ghij-klmn-opqr-stuv-wxyz-123456', deviceSize: '12345678901234567',
      dataAreas: [{ offset: '4096', size: '8192' }],
      metadataAreas: [{ offset: '1024', size: '2048' }],
    });
    expect(result.storedCrc).toBe(result.computedCrc);
    render(<Lvm2PvInspectorTool />);
    submit(fixture());
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('12345678901234567 bytes')).toBeInTheDocument();
    expect(screen.getByText('Offset: 1024 bytes; Size: 2048 bytes')).toBeInTheDocument();
  });

  it('flags a corrupted CRC', () => {
    const bytes = fixture();
    bytes[512 + 16] ^= 1;
    render(<Lvm2PvInspectorTool />);
    submit(bytes);
    expect(screen.getByText('Mismatch')).toBeInTheDocument();
  });

  it.each([
    [new Uint8Array(), /empty/i],
    [new Uint8Array(100), /short/i],
    [new Uint8Array(2048), /not an LVM2/i],
  ])('alerts for invalid input', (bytes, message) => {
    render(<Lvm2PvInspectorTool />);
    submit(bytes);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('ignores a file read superseded by text input', async () => {
    let resolveRead;
    const file = new File(['x'], 'volume.img');
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () => new Promise((resolve) => { resolveRead = resolve; }),
    });
    render(<Lvm2PvInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select a file'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Hexadecimal input'), { target: { value: '00' } });
    fireEvent.click(screen.getByText('Inspect hex'));
    resolveRead(fixture().buffer);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/short/i));
    expect(screen.queryByText('Label header')).not.toBeInTheDocument();
  });
});
