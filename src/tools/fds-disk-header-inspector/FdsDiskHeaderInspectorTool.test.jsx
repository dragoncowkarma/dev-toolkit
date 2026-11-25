import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FdsDiskHeaderInspectorTool from './FdsDiskHeaderInspectorTool.jsx';
import * as fdsUtils from './fdsDiskHeaderInspector.utils.js';

vi.mock('./fdsDiskHeaderInspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, inspectFdsFile: vi.fn(actual.inspectFdsFile) };
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

function writeAscii(target, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    target[offset + i] = text.charCodeAt(i);
  }
}

function createSideBytes({
  size = fdsUtils.FDS_SIDE_SIZE,
  blockCode = 0x01,
  verification = '*NINTENDO-HVC*',
  makerCode = 0x01,
  gameName = 'ZEL',
  gameVersion = 0x01,
  sideNumber = 0x00,
  diskNumber = 0x00,
  diskType = 0x00,
} = {}) {
  const bytes = new Uint8Array(size);
  if (size > 0) bytes[0] = blockCode;
  if (size >= 15) writeAscii(bytes, 1, verification.slice(0, 14));
  if (size > 0x0f) bytes[0x0f] = makerCode;
  if (size >= 0x13) writeAscii(bytes, 0x10, gameName.slice(0, 3));
  if (size > 0x14) bytes[0x14] = gameVersion;
  if (size > 0x15) bytes[0x15] = sideNumber;
  if (size > 0x16) bytes[0x16] = diskNumber;
  if (size > 0x17) bytes[0x17] = diskType;
  return bytes;
}

function createHeaderedFile(sideConfigs, fileName = 'game.fds') {
  const header = new Uint8Array(16);
  header.set([0x46, 0x44, 0x53, 0x1a, sideConfigs.length]);
  const chunks = [header, ...sideConfigs.map((cfg) => createSideBytes(cfg))];
  return new File(chunks, fileName);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FdsDiskHeaderInspectorTool', () => {
  it('renders an empty state initially with Clear disabled', () => {
    render(<FdsDiskHeaderInspectorTool />);

    expect(screen.getByText(/Select or drop an FDS disk image/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('renders header, side count, trailing bytes, and Block 1 for a headered image', async () => {
    render(<FdsDiskHeaderInspectorTool />);

    const file = createHeaderedFile(
      [
        { gameName: 'ZEL', sideNumber: 0x00, diskNumber: 0x00 },
        { gameName: 'ZEL', sideNumber: 0x01, diskNumber: 0x00 },
      ],
      'zelda.fds',
    );
    const input = screen.getByLabelText('Select an FDS disk image file');
    selectFile(input, file);

    await waitFor(() => expect(screen.getByText('zelda.fds')).toBeInTheDocument());
    expect(screen.getByText('Present (16 B, FDS\\x1A)')).toBeInTheDocument();
    expect(screen.getByText('Side A (0x00)')).toBeInTheDocument();
    expect(screen.getByText('Side B (0x01)')).toBeInTheDocument();
    expect(screen.getByText('0 B')).toBeInTheDocument();
    expect(screen.getByText(/Remaining blocks, CRCs, and disk contents are not verified/i))
      .toBeInTheDocument();
  });

  it('displays notices for a bad verification string and empty file', async () => {
    render(<FdsDiskHeaderInspectorTool />);
    const input = screen.getByLabelText('Select an FDS disk image file');

    const badFile = new File(
      [createSideBytes({ verification: '*WRONG-STRING*' })],
      'bad.fds',
    );
    selectFile(input, badFile);

    await waitFor(() => expect(screen.getByText('Block 1 mismatch')).toBeInTheDocument());
    expect(screen.getByText('*WRONG-STRING*')).toBeInTheDocument();

    const emptyFile = new File([], 'empty.fds');
    selectFile(input, emptyFile);

    await waitFor(() =>
      expect(screen.getByText(/File is empty \(0 B\)/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('No disk side blocks found to inspect.')).toBeInTheDocument();
  });

  it('renders Unknown fields and trailing byte count for a truncated image', async () => {
    render(<FdsDiskHeaderInspectorTool />);
    const input = screen.getByLabelText('Select an FDS disk image file');

    const truncatedFile = new File([createSideBytes({ size: 17 })], 'short.fds');
    selectFile(input, truncatedFile);

    await waitFor(() => expect(screen.getByText('Truncated side')).toBeInTheDocument());
    expect(screen.getByText('Trailing Bytes').nextElementSibling).toHaveTextContent('17 B');
    expect(screen.getByText('File-Size Side Count').nextElementSibling).toHaveTextContent('0');
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(5);
  });

  it('discards a stale inspection result that resolves after Clear', async () => {
    const deferred = createDeferred();
    fdsUtils.inspectFdsFile.mockReturnValueOnce(deferred.promise);

    render(<FdsDiskHeaderInspectorTool />);

    const input = screen.getByLabelText('Select an FDS disk image file');
    selectFile(input, new File([createSideBytes()], 'old.fds'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve({
        fileName: 'old.fds',
        fileSize: fdsUtils.FDS_SIDE_SIZE,
        isEmpty: false,
        fwNesHeader: { present: false, sideCount: null },
        derivedSideCount: 1,
        trailingBytes: 0,
        sides: [],
        warnings: [],
        scopeNote: 'Limited checks.',
      });
      await Promise.resolve();
    });

    expect(screen.queryByText('old.fds')).not.toBeInTheDocument();
    expect(screen.getByText(/Select or drop an FDS disk image/i)).toBeInTheDocument();
  });

  it('applies only the latest file selection when an older read resolves last', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    fdsUtils.inspectFdsFile
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<FdsDiskHeaderInspectorTool />);

    const input = screen.getByLabelText('Select an FDS disk image file');
    selectFile(input, new File([createSideBytes()], 'first.fds'));
    selectFile(input, new File([createSideBytes()], 'second.fds'));

    await act(async () => {
      deferredNew.resolve({
        fileName: 'second.fds',
        fileSize: fdsUtils.FDS_SIDE_SIZE,
        isEmpty: false,
        fwNesHeader: { present: false, sideCount: null },
        derivedSideCount: 1,
        trailingBytes: 0,
        sides: [],
        warnings: [],
        scopeNote: 'Limited checks.',
      });
      await Promise.resolve();
    });

    await act(async () => {
      deferredOld.resolve({
        fileName: 'first.fds',
        fileSize: fdsUtils.FDS_SIDE_SIZE,
        isEmpty: false,
        fwNesHeader: { present: false, sideCount: null },
        derivedSideCount: 1,
        trailingBytes: 0,
        sides: [],
        warnings: [],
        scopeNote: 'Limited checks.',
      });
      await Promise.resolve();
    });

    expect(screen.getByText('second.fds')).toBeInTheDocument();
    expect(screen.queryByText('first.fds')).not.toBeInTheDocument();
  });

  it('displays an alert when file reading fails and resets on Clear', async () => {
    fdsUtils.inspectFdsFile.mockRejectedValueOnce(new Error('Disk read error'));

    render(<FdsDiskHeaderInspectorTool />);

    const input = screen.getByLabelText('Select an FDS disk image file');
    selectFile(input, new File(['bad'], 'broken.fds'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk read error');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
