import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Jffs2NodeHeaderInspectorTool from './Jffs2NodeHeaderInspectorTool.jsx';
import * as jffs2Utils from './jffs2.utils.js';

vi.mock('./jffs2.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, inspectJffs2File: vi.fn(actual.inspectJffs2File) };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Jffs2NodeHeaderInspectorTool', () => {
  it('renders local-only privacy notice and loads LE/BE samples', () => {
    render(<Jffs2NodeHeaderInspectorTool />);

    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`file\\.slice\\(0, ${jffs2Utils.MAX_INSPECT_BYTES}\\)`)),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'Sample (LE)' }));
    expect(screen.getByText('Little-endian (0x1985)')).toBeInTheDocument();
    expect(screen.getByText('CLEANMARKER')).toBeInTheDocument();
    expect(screen.getByText('INODE')).toBeInTheDocument();
    expect(screen.getByText('DIRENT')).toBeInTheDocument();
    expect(screen.getByText(/erased-region/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sample (BE)' }));
    expect(screen.getByText('Big-endian (0x8519)')).toBeInTheDocument();
  });

  it('inspects an uploaded file with CRC mismatch, truncation, and erased flags', async () => {
    const bytes = jffs2Utils.concatBytes([
      jffs2Utils.buildJffs2Node({
        nodetype: 0x2003,
        totlen: 12,
        littleEndian: true,
        hdrCrc: 0x11223344,
      }),
      new Uint8Array(16).fill(0xff),
      jffs2Utils.buildJffs2Node({
        nodetype: 0xe002,
        totlen: 64,
        littleEndian: true,
        bufferLength: 16,
      }),
    ]);
    const file = new File([bytes], 'broken.jffs2', { type: 'application/octet-stream' });
    const sliceSpy = vi.spyOn(file, 'slice');

    render(<Jffs2NodeHeaderInspectorTool />);
    const input = screen.getByLabelText('Inspect a local JFFS2 image file');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('broken.jffs2')).toBeInTheDocument();
    });

    expect(sliceSpy).toHaveBeenCalledWith(0, 4096);
    expect(screen.getByText('CRC Mismatch')).toBeInTheDocument();
    expect(screen.getByText('Truncated')).toBeInTheDocument();
    expect(screen.getByText('crc-mismatch')).toBeInTheDocument();
    expect(screen.getByText('erased-region')).toBeInTheDocument();
    expect(screen.getByText('truncated-node')).toBeInTheDocument();
  });

  it('ignores stale file reads that resolve after Clear', async () => {
    const deferred = createDeferred();
    jffs2Utils.inspectJffs2File.mockReturnValueOnce(deferred.promise);

    render(<Jffs2NodeHeaderInspectorTool />);
    const input = screen.getByLabelText('Inspect a local JFFS2 image file');
    const file = new File([new Uint8Array(16).fill(0xff)], 'late.jffs2');

    selectFile(input, file);
    fireEvent.click(screen.getByRole('button', { name: 'Sample (LE)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve(jffs2Utils.parseJffs2Nodes(new Uint8Array(16).fill(0xff)));
      await Promise.resolve();
    });

    expect(screen.queryByText('late.jffs2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Inspection summary')).not.toBeInTheDocument();
  });

  it('shows Window-limited status without truncated-node error for an 8192-byte image', async () => {
    const raw = new Uint8Array(8192);
    const largeInode = jffs2Utils.buildJffs2Node({
      nodetype: 0xe002,
      totlen: 4164,
      littleEndian: true,
      bufferLength: 4164,
    });
    raw.set(largeInode, 0);

    const file = new File([raw], 'firmware.jffs2', { type: 'application/octet-stream' });

    render(<Jffs2NodeHeaderInspectorTool />);
    const input = screen.getByLabelText('Inspect a local JFFS2 image file');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('firmware.jffs2')).toBeInTheDocument();
    });

    expect(
      screen.getByText(new RegExp(`\\(${jffs2Utils.MAX_INSPECT_BYTES} B cap\\)`)),
    ).toBeInTheDocument();
    expect(screen.getByText('Window-limited')).toBeInTheDocument();
    expect(screen.getByText('window-limited-node')).toBeInTheDocument();
    expect(screen.queryByText('truncated-node')).not.toBeInTheDocument();
  });
});
