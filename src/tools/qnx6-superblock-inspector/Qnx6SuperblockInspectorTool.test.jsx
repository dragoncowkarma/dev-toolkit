import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Qnx6SuperblockInspectorTool from './Qnx6SuperblockInspectorTool.jsx';
import { PREFIX_SIZE } from './qnx6Superblock.utils.js';

afterEach(cleanup);

function validImage(serial) {
  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  view.setUint32(0, 0x68191122, true);
  view.setBigUint64(8, BigInt(serial), true);
  return buffer;
}

describe('QNX6 inspector', () => {
  it('uses bounded reads and ignores an older read that resolves later', async () => {
    let finishFirst;
    const first = { name: 'old.img', slice: vi.fn(() => ({
      arrayBuffer: () => new Promise((resolve) => { finishFirst = resolve; }),
    })) };
    const second = { name: 'new.img', slice: vi.fn(() => ({
      arrayBuffer: () => Promise.resolve(validImage(2)),
    })) };
    render(<Qnx6SuperblockInspectorTool />);
    const input = screen.getByLabelText(/choose a qnx6 image/i);
    fireEvent.change(input, { target: { files: [first] } });
    fireEvent.change(input, { target: { files: [second] } });
    await screen.findByText('new.img', { exact: false });
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    finishFirst(validImage(1));
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(first.slice).toHaveBeenCalledWith(0, PREFIX_SIZE);
    expect(second.slice).toHaveBeenCalledWith(0, PREFIX_SIZE);
    expect(screen.queryByText('old.img', { exact: false })).not.toBeInTheDocument();
  });

  it('reports errors from dropped files', async () => {
    render(<Qnx6SuperblockInspectorTool />);
    fireEvent.drop(screen.getByText(/choose a qnx6 image/i).parentElement, {
      dataTransfer: { files: [{ name: 'bad.img', slice: () => ({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(512)),
      }) }] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/bad magic/i);
  });
});
