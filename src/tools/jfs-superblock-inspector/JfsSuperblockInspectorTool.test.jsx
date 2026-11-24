import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JfsSuperblockInspectorTool from './JfsSuperblockInspectorTool.jsx';
import { sampleHex, SUPERBLOCK_LENGTH, SUPERBLOCK_OFFSET } from './jfs.utils.js';

afterEach(cleanup);

describe('JFS inspector', () => {
  it('ignores reads that complete after a newer selection', async () => {
    render(<JfsSuperblockInspectorTool />);
    const input = screen.getByLabelText('Upload disk image');
    const bytes = Uint8Array.from(sampleHex().split(' '), (part) => parseInt(part, 16));
    let finishFirst;
    const firstRead = new Promise((resolve) => { finishFirst = resolve; });
    const first = new File(['a'], 'first');
    const second = new File(['b'], 'second');
    const firstSlice = vi.spyOn(first, 'slice').mockReturnValue({ arrayBuffer: () => firstRead });
    vi.spyOn(second, 'slice').mockReturnValue({ arrayBuffer: async () => bytes.buffer });
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });
    await screen.findByText('Example');
    expect(firstSlice).toHaveBeenCalledWith(
      SUPERBLOCK_OFFSET, SUPERBLOCK_OFFSET + SUPERBLOCK_LENGTH,
    );
    finishFirst(new Uint8Array(8).buffer);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('Example')).toBeInTheDocument();
  });
  it('invalidates pending reads when clearing or editing', async () => {
    render(<JfsSuperblockInspectorTool />);
    let finish;
    const file = new File(['a'], 'first');
    vi.spyOn(file, 'slice').mockReturnValue({
      arrayBuffer: () => new Promise((resolve) => { finish = resolve; }),
    });
    fireEvent.change(screen.getByLabelText('Upload disk image'), { target: { files: [file] } });
    fireEvent.click(screen.getByText('Sample'));
    expect(screen.getByText('Example')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear'));
    finish(new Uint8Array(8).buffer);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText('Example')).not.toBeInTheDocument();
  });
});
