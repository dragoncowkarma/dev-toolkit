import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CramfsSuperblockInspectorTool from './CramfsSuperblockInspectorTool.jsx';
import * as cramfsUtils from './cramfs.utils.js';

const { createSampleSuperblock } = cramfsUtils;

vi.mock('./cramfs.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readBlobAsArrayBuffer: vi.fn(actual.readBlobAsArrayBuffer),
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
  vi.clearAllMocks();
});

describe('CramfsSuperblockInspectorTool', () => {
  it('renders initial empty state with file selection and sample buttons', () => {
    render(<CramfsSuperblockInspectorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'CramFS Superblock Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load LE Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load BE Sample' })).toBeInTheDocument();
  });

  it('loads and displays a Little-Endian sample on button click', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    expect(screen.getByText('0x28cd3d45')).toBeInTheDocument();
    expect(screen.getByText('"Compressed ROMFS"')).toBeInTheDocument();
    expect(screen.getByText('"sample_le.cramfs"')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads and displays a Big-Endian sample on button click', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load BE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    });

    expect(screen.getByText('0x28cd3d45')).toBeInTheDocument();
    expect(screen.getByText('"sample_be.cramfs"')).toBeInTheDocument();
  });

  it('inspects an uploaded Little-Endian CramFS image file', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const sample = createSampleSuperblock({
      endianness: 'little',
      size: 65536,
      name: 'my_filesystem',
    });
    // Create image larger than 76 bytes to ensure only 76 bytes are read
    const fullImage = new Uint8Array(100000);
    fullImage.set(sample, 0);

    const file = new File([fullImage], 'test_le.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    expect(screen.getByText('"my_filesystem"')).toBeInTheDocument();
    expect(screen.getAllByText(/100,000 bytes/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows truncated error alert and resets state when uploaded file is < 76 bytes', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const file = new File([new Uint8Array(30)], 'short.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        /Truncated CramFS image: expected at least 76 bytes, received 30 byte\(s\)/i
      );
    });

    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
    expect(screen.queryByText('Big-Endian (BE)')).not.toBeInTheDocument();
  });

  it('shows bad magic error alert and resets state on corrupted file', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const badData = new Uint8Array(80);
    badData[0] = 0xde;
    badData[1] = 0xad;
    badData[2] = 0xbe;
    badData[3] = 0xef;

    const file = new File([badData], 'corrupt.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Invalid CramFS magic: expected 0x28cd3d45/i);
    });

    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when user clicks Clear button', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when a new file selection fails after a valid file was displayed', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    // Now select a truncated file
    const file = new File([new Uint8Array(10)], 'broken.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Previous valid data should be gone
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when file input event fires with no files', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Upload CramFS image');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    fireEvent.change(input);

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('handles the file picker cancel event directly by resetting state', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Upload CramFS image');
    fireEvent(input, new Event('cancel'));

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears old details and shows loading status when a new file selection begins', async () => {
    const deferred = createDeferred();
    cramfsUtils.readBlobAsArrayBuffer.mockReturnValueOnce(deferred.promise);

    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Upload CramFS image');
    const slowFile = new File([new Uint8Array(100)], 'slow_read.cramfs');

    await act(async () => {
      selectFile(input, slowFile);
    });

    // Old details must be cleared immediately and not displayed under the new file name
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
    expect(screen.getByText(/slow_read\.cramfs/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading and inspecting superblock...');

    const validSample = cramfsUtils.createSampleSuperblock({
      endianness: 'big',
      name: 'slow_read_fs',
    });

    await act(async () => {
      deferred.resolve(validSample.buffer);
    });

    await waitFor(() => {
      expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    });
    expect(screen.getByText('"slow_read_fs"')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores superseded async read when user clicks Clear before read finishes', async () => {
    const deferred = createDeferred();
    cramfsUtils.readBlobAsArrayBuffer.mockReturnValueOnce(deferred.promise);

    render(<CramfsSuperblockInspectorTool />);

    const input = screen.getByLabelText('Upload CramFS image');
    const slowFile = new File([new Uint8Array(100)], 'slow_cleared.cramfs');

    await act(async () => {
      selectFile(input, slowFile);
    });

    expect(screen.getByText(/slow_cleared\.cramfs/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    const validSample = cramfsUtils.createSampleSuperblock({
      name: 'should_be_ignored',
    });

    await act(async () => {
      deferred.resolve(validSample.buffer);
    });

    // Result should still be empty
    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('"should_be_ignored"')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores superseded async read when user loads a sample before read finishes', async () => {
    const deferred = createDeferred();
    cramfsUtils.readBlobAsArrayBuffer.mockReturnValueOnce(deferred.promise);

    render(<CramfsSuperblockInspectorTool />);

    const input = screen.getByLabelText('Upload CramFS image');
    const slowFile = new File([new Uint8Array(100)], 'slow_sample_override.cramfs');

    await act(async () => {
      selectFile(input, slowFile);
    });

    expect(screen.getByText(/slow_sample_override\.cramfs/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load BE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    });
    expect(screen.getByText('"sample_be.cramfs"')).toBeInTheDocument();

    const validLe = cramfsUtils.createSampleSuperblock({
      endianness: 'little',
      name: 'stale_le',
    });

    await act(async () => {
      deferred.resolve(validLe.buffer);
    });

    // BE sample must remain displayed
    expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    expect(screen.getByText('"sample_be.cramfs"')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('ignores stale out-of-order reads when older read resolves after newer read', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    cramfsUtils.readBlobAsArrayBuffer
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<CramfsSuperblockInspectorTool />);

    const input = screen.getByLabelText('Upload CramFS image');
    const oldFile = new File([new Uint8Array(100)], 'first_file.cramfs');
    const newFile = new File([new Uint8Array(100)], 'second_file.cramfs');

    await act(async () => {
      selectFile(input, oldFile);
    });
    await act(async () => {
      selectFile(input, newFile);
    });

    const sampleNew = cramfsUtils.createSampleSuperblock({
      endianness: 'big',
      name: 'second_fs',
    });
    const sampleOld = cramfsUtils.createSampleSuperblock({
      endianness: 'little',
      name: 'first_fs',
    });

    // Newer read finishes first
    await act(async () => {
      deferredNew.resolve(sampleNew.buffer);
    });

    await waitFor(() => {
      expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    });
    expect(screen.getByText('"second_fs"')).toBeInTheDocument();
    expect(screen.getByText(/second_file\.cramfs/)).toBeInTheDocument();

    // Older read finishes late
    await act(async () => {
      deferredOld.resolve(sampleOld.buffer);
    });

    // Newer result must remain displayed
    expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    expect(screen.getByText('"second_fs"')).toBeInTheDocument();
    expect(screen.queryByText('"first_fs"')).not.toBeInTheDocument();
  });

  it('ignores stale read failure when older read rejects after newer read succeeds', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    cramfsUtils.readBlobAsArrayBuffer
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<CramfsSuperblockInspectorTool />);

    const input = screen.getByLabelText('Upload CramFS image');
    const oldFile = new File([new Uint8Array(100)], 'fail_old.cramfs');
    const newFile = new File([new Uint8Array(100)], 'success_new.cramfs');

    await act(async () => {
      selectFile(input, oldFile);
    });
    await act(async () => {
      selectFile(input, newFile);
    });

    const sampleNew = cramfsUtils.createSampleSuperblock({
      endianness: 'little',
      name: 'success_fs',
    });

    // Newer read succeeds
    await act(async () => {
      deferredNew.resolve(sampleNew.buffer);
    });

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });
    expect(screen.getByText('"success_fs"')).toBeInTheDocument();

    // Older read rejects
    await act(async () => {
      deferredOld.reject(new Error('Old file I/O error'));
    });

    // No error should be shown; newer result stays
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    expect(screen.getByText('"success_fs"')).toBeInTheDocument();
  });
});
