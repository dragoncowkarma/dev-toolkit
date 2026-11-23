import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErofsSuperblockInspectorTool from './ErofsSuperblockInspectorTool.jsx';
import * as utils from './erofs-superblock-inspector.utils.js';

vi.mock('./erofs-superblock-inspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readErofsSuperblockSlice: vi.fn(actual.readErofsSuperblockSlice),
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ErofsSuperblockInspectorTool', () => {
  it('renders initial state with title, description, and upload/sample controls', () => {
    render(<ErofsSuperblockInspectorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'EROFS Superblock Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Upload EROFS Image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(
      screen.getByText(/Select an EROFS filesystem image file or click "Load Sample" to inspect/i)
    ).toBeInTheDocument();
  });

  it('loads and inspects sample EROFS superblock when "Load Sample" is clicked', async () => {
    render(<ErofsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    await waitFor(() => {
      expect(screen.getByTestId('erofs-details')).toBeInTheDocument();
    });

    expect(screen.getByText('0xE0F5E1E2')).toBeInTheDocument();
    expect(screen.getByText('erofs_root')).toBeInTheDocument();
    expect(screen.getByText(/4,096/)).toBeInTheDocument();
    expect(screen.getByText(/blkszbits: 12/)).toBeInTheDocument();
    expect(screen.getByText('1048576')).toBeInTheDocument();
    expect(screen.getByText('ZERO_PADDING')).toBeInTheDocument();
    expect(screen.getByText('COMPR_CFGS')).toBeInTheDocument();
    expect(screen.getByText('SB_CHKSUM')).toBeInTheDocument();

    // Verify reported actual file size
    expect(screen.getByText(/4.0 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('inspects an uploaded valid EROFS image file', async () => {
    const fullImage = utils.createSampleImage({
      volume_name: 'uploaded_fs',
      root_nid: 99,
      inos: 54321n,
    });
    const file = new File([fullImage], 'system.erofs', {
      type: 'application/octet-stream',
    });

    render(<ErofsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload EROFS Image');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByTestId('erofs-details')).toBeInTheDocument();
    });

    expect(screen.getByText('uploaded_fs')).toBeInTheDocument();
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.getByText('54321')).toBeInTheDocument();
    expect(screen.getByText(/📄 system.erofs/)).toBeInTheDocument();
  });

  it('displays clear error on invalid magic number', async () => {
    const invalidImage = utils.createSampleImage({ magic: 0xDEADBEEF });
    const file = new File([invalidImage], 'bad.img', { type: 'application/octet-stream' });

    render(<ErofsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload EROFS Image');
    await act(async () => selectFile(fileInput, file));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid EROFS magic: 0xDEADBEEF (expected 0xE0F5E1E2).');
    expect(screen.queryByTestId('erofs-details')).not.toBeInTheDocument();
  });

  it('displays clear error on truncated image input (< 1152 bytes)', async () => {
    const shortFile = new File([new Uint8Array(600)], 'short.img');

    render(<ErofsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload EROFS Image');
    await act(async () => selectFile(fileInput, shortFile));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Truncated EROFS image');
    expect(alert).toHaveTextContent('600 bytes');
    expect(screen.queryByTestId('erofs-details')).not.toBeInTheDocument();
  });

  it('resets state on failed or cancelled file selection', async () => {
    render(<ErofsSuperblockInspectorTool />);

    // First load sample
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByTestId('erofs-details')).toBeInTheDocument();
    });

    // Simulate cancelling file input (empty files array)
    const fileInput = screen.getByLabelText('Upload EROFS Image');
    Object.defineProperty(fileInput, 'files', { value: [], configurable: true });
    fireEvent.change(fileInput);

    expect(screen.queryByTestId('erofs-details')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears all inspection data and errors when Clear button is clicked', async () => {
    render(<ErofsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByTestId('erofs-details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByTestId('erofs-details')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Uploaded file details')).not.toBeInTheDocument();
  });

  it('ignores stale FileReader resolution after Clear', async () => {
    const deferred = createDeferred();
    utils.readErofsSuperblockSlice.mockReturnValueOnce(deferred.promise);

    render(<ErofsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload EROFS Image');
    const file = new File([new Uint8Array(2048)], 'test.img');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const sampleSb = utils.createSampleSuperblock();
    await act(async () => {
      deferred.resolve(sampleSb);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('erofs-details')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('applies only the latest file selection when an older read resolves last', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();

    utils.readErofsSuperblockSlice
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<ErofsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload EROFS Image');
    const oldFile = new File([new Uint8Array(2048)], 'old.img');
    const newFile = new File([new Uint8Array(4096)], 'new.img');

    selectFile(fileInput, oldFile);
    selectFile(fileInput, newFile);

    const oldSb = utils.createSampleSuperblock({ volume_name: 'old_fs' });
    const newSb = utils.createSampleSuperblock({ volume_name: 'new_fs' });

    await act(async () => {
      deferredNew.resolve(newSb);
      await Promise.resolve();
    });
    await act(async () => {
      deferredOld.resolve(oldSb);
      await Promise.resolve();
    });

    expect(screen.getByText('new_fs')).toBeInTheDocument();
    expect(screen.queryByText('old_fs')).not.toBeInTheDocument();
  });

  it('copies JSON export to clipboard and shows transient feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ErofsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const copiedJson = JSON.parse(writeText.mock.calls[0][0]);
    expect(copiedJson.magic).toBe('0xE0F5E1E2');
    expect(copiedJson.volume_name).toBe('erofs_root');
    expect(screen.getByText('✓ JSON Copied')).toBeInTheDocument();
  });
});
