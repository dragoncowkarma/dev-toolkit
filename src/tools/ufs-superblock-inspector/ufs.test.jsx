import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import UfsSuperblockTool from './UfsSuperblockTool.jsx';
import { decodeSuperblock, inspectImage, SUPERBLOCK_LENGTH } from './ufs.utils.js';

afterEach(cleanup);

function fixture(version, little = true) {
  const bytes = new Uint8Array(SUPERBLOCK_LENGTH);
  const view = new DataView(bytes.buffer);
  view.setUint32(1372, version === 1 ? 0x011954 : 0x19540119, little);
  view.setUint32(36, 123, little);
  view.setUint32(40, 100, little);
  view.setUint32(44, 4, little);
  view.setUint32(48, 8192, little);
  view.setUint32(52, 1024, little);
  view.setUint32(56, 8, little);
  view.setUint32(144, 0x12345678, little);
  view.setUint32(148, 0xabcdef01, little);
  view.setUint32(184, 256, little);
  view.setUint32(188, 512, little);
  view.setBigUint64(1080, 9007199254740993n, little);
  view.setBigUint64(1088, 9007199254740992n, little);
  bytes.set(new TextEncoder().encode('test-volume'), 680);
  return bytes;
}

describe('UFS superblock decoding', () => {
  it('decodes UFS1 fields', () => {
    expect(decodeSuperblock(fixture(1)).fields).toMatchObject({
      Version: 'UFS1', fs_size: 123, fs_dsize: 100, fs_ncg: 4,
      fs_bsize: 8192, fs_fsize: 1024, fs_frag: 8, fs_ipg: 256, fs_fpg: 512,
      fs_id: '12345678:abcdef01', fs_volname: 'test-volume',
    });
  });

  it('decodes big-endian UFS2 sizes without losing precision', () => {
    expect(decodeSuperblock(fixture(2, false)).fields).toMatchObject({
      Version: 'UFS2', 'Byte order': 'Big-endian', fs_size: 9007199254740993n,
      fs_dsize: 9007199254740992n,
    });
  });

  it('reports bad magic and truncated input', () => {
    expect(decodeSuperblock(new Uint8Array(SUPERBLOCK_LENGTH)).error).toMatch(/invalid/i);
    expect(decodeSuperblock(new Uint8Array(200)).error).toMatch(/truncated/i);
  });

  it('reads only bounded candidate slices and finds the legacy offset', async () => {
    const slice = vi.fn((start, end) => ({
      arrayBuffer: async () => (start === 262144 ? fixture(2) : new Uint8Array(end - start))
        .buffer,
    }));
    const result = await inspectImage({ size: 1000000, slice });
    expect(result.offset).toBe(262144);
    expect(slice.mock.calls).toEqual([[65536, 66912], [8192, 9568], [262144, 263520]]);
  });
});

describe('UFS inspector input', () => {
  it('displays alerts for invalid and truncated pasted bytes', () => {
    render(<UfsSuperblockTool />);
    const input = screen.getByLabelText(/paste hex/i);
    fireEvent.change(input, { target: { value: '00' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
    fireEvent.change(input, { target: { value: '00'.repeat(SUPERBLOCK_LENGTH) } });
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid/i);
  });

  it('discards a file read after newer pasted input', async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const file = { name: 'old.img', size: 100000, slice: () => ({ arrayBuffer: () => pending }) };
    render(<UfsSuperblockTool />);
    fireEvent.change(screen.getByLabelText(/choose or drop/i), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/paste hex/i), { target: { value: '00' } });
    await act(async () => { resolve(fixture(2).buffer); await pending; });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i));
    expect(screen.queryByText('UFS2')).not.toBeInTheDocument();
  });
});
