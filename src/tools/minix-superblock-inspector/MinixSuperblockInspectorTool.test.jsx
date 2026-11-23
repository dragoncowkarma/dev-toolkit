import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MinixSuperblockInspectorTool from './MinixSuperblockInspectorTool.jsx';
import * as minixUtils from './minix-superblock-inspector.utils.js';

vi.mock('./minix-superblock-inspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileBuffer: vi.fn(actual.readFileBuffer),
  };
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

describe('MinixSuperblockInspectorTool rendering and sample variants', () => {
  it('renders tool title, placeholder, and controls', () => {
    render(<MinixSuperblockInspectorTool />);
    expect(
      screen.getByLabelText('Minix Filesystem Superblock Inspector')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(
      screen.getByText(/Select a Minix filesystem image file or choose a sample/i)
    ).toBeInTheDocument();
  });

  it('loads Minix v1 (14-byte names, 0x137F) sample', () => {
    render(<MinixSuperblockInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select Minix Sample'), {
      target: { value: 'v1_14' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('Minix v1 (14-byte names)')).toBeInTheDocument();
    expect(screen.getByText('0x137F')).toBeInTheDocument();
    expect(screen.getByText('s_ninodes')).toBeInTheDocument();
    expect(screen.getByText('s_nzones (16-bit)')).toBeInTheDocument();
  });

  it('loads Minix v1 (30-byte names, 0x138F) sample', () => {
    render(<MinixSuperblockInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select Minix Sample'), {
      target: { value: 'v1_30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('Minix v1 (30-byte names)')).toBeInTheDocument();
    expect(screen.getByText('0x138F')).toBeInTheDocument();
  });

  it('loads Minix v2 (14-byte names, 0x2468) sample', () => {
    render(<MinixSuperblockInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select Minix Sample'), {
      target: { value: 'v2_14' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('Minix v2 (14-byte names)')).toBeInTheDocument();
    expect(screen.getByText('0x2468')).toBeInTheDocument();
    expect(screen.getByText('s_zones (32-bit)')).toBeInTheDocument();
  });

  it('loads Minix v2 (30-byte names, 0x2478) sample', () => {
    render(<MinixSuperblockInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select Minix Sample'), {
      target: { value: 'v2_30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('Minix v2 (30-byte names)')).toBeInTheDocument();
    expect(screen.getByText('0x2478')).toBeInTheDocument();
  });

  it('loads Minix v3 (0x4D5A) sample with v3 block size', () => {
    render(<MinixSuperblockInspectorTool />);
    fireEvent.change(screen.getByLabelText('Select Minix Sample'), {
      target: { value: 'v3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    expect(screen.getByText('Minix v3')).toBeInTheDocument();
    expect(screen.getByText('0x4D5A')).toBeInTheDocument();
    expect(screen.getByText('s_blocksize (Minix v3)')).toBeInTheDocument();
    expect(screen.getByText('1,024 B')).toBeInTheDocument();
  });
});

describe('MinixSuperblockInspectorTool file upload and error handling', () => {
  it('reports error on empty file upload (0 bytes)', async () => {
    render(<MinixSuperblockInspectorTool />);
    const file = new File([], 'empty.img');
    const input = screen.getByLabelText('Upload Minix filesystem image');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/empty/i);
    });
    expect(screen.queryByLabelText('Superblock Details')).not.toBeInTheDocument();
  });

  it('reports error on truncated file upload (< 1056 bytes)', async () => {
    render(<MinixSuperblockInspectorTool />);
    const file = new File([new Uint8Array(500)], 'short.img');
    const input = screen.getByLabelText('Upload Minix filesystem image');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/truncated/i);
    });
    expect(screen.queryByLabelText('Superblock Details')).not.toBeInTheDocument();
  });

  it('reports error on unknown magic', async () => {
    render(<MinixSuperblockInspectorTool />);
    const badBytes = new Uint8Array(1056);
    const view = new DataView(badBytes.buffer);
    view.setUint16(1024 + 16, 0xBEFF, true);
    const file = new File([badBytes], 'corrupt.img');
    const input = screen.getByLabelText('Upload Minix filesystem image');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Unknown magic: 0xBEFF/);
    });
    expect(screen.queryByLabelText('Superblock Details')).not.toBeInTheDocument();
  });

  it('displays high-bit unsigned flags properly without negative numbers', async () => {
    render(<MinixSuperblockInspectorTool />);
    const bytes = minixUtils.createSampleMinixSuperblock(minixUtils.MINIX_MAGIC.V1_14, {
      state: 0x8001,
    });
    const file = new File([bytes], 'highbit.img');
    const input = screen.getByLabelText('Upload Minix filesystem image');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('0x8001')).toBeInTheDocument();
    });
    expect(screen.getByText(/Unknown bits: 0x8000/)).toBeInTheDocument();
  });
});

describe('MinixSuperblockInspectorTool async reads, Clear, and cancel', () => {
  it('discards superseded read after Clear', async () => {
    const deferred = createDeferred();
    minixUtils.readFileBuffer.mockReturnValueOnce(deferred.promise);

    render(<MinixSuperblockInspectorTool />);
    const file = new File([new Uint8Array(1056)], 'test.img');
    const input = screen.getByLabelText('Upload Minix filesystem image');

    selectFile(input, file);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve(
        minixUtils.createSampleMinixSuperblock(minixUtils.MINIX_MAGIC.V1_14)
      );
      await Promise.resolve();
    });

    expect(screen.queryByLabelText('Superblock Details')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles out-of-order deferred reads and displays only the latest selection', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    minixUtils.readFileBuffer
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<MinixSuperblockInspectorTool />);
    const input = screen.getByLabelText('Upload Minix filesystem image');
    const oldFile = new File([new Uint8Array(1056)], 'old.img');
    const newFile = new File([new Uint8Array(1056)], 'new.img');

    selectFile(input, oldFile);
    selectFile(input, newFile);

    // Resolve newer selection first (v3)
    await act(async () => {
      deferredNew.resolve(
        minixUtils.createSampleMinixSuperblock(minixUtils.MINIX_MAGIC.V3)
      );
      await Promise.resolve();
    });

    // Resolve older selection later (v1)
    await act(async () => {
      deferredOld.resolve(
        minixUtils.createSampleMinixSuperblock(minixUtils.MINIX_MAGIC.V1_14)
      );
      await Promise.resolve();
    });

    // Only v3 should be displayed
    expect(screen.getByText('Minix v3')).toBeInTheDocument();
    expect(screen.getByText('0x4D5A')).toBeInTheDocument();
    expect(screen.queryByText('Minix v1 (14-byte names)')).not.toBeInTheDocument();
  });

  it('handles file input cancel event cleanly', () => {
    render(<MinixSuperblockInspectorTool />);
    const input = screen.getByLabelText('Upload Minix filesystem image');

    // Fire cancel event
    fireEvent(input, new Event('cancel', { bubbles: true }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Select a Minix filesystem image file or choose a sample/i)
    ).toBeInTheDocument();
  });
});
