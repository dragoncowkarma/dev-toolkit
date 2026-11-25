import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AmigaRdbInspectorTool from './AmigaRdbInspectorTool.jsx';
import * as amigaRdbUtils from './amigaRdb.utils.js';

vi.mock('./amigaRdb.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readRdbSlice: vi.fn(actual.readRdbSlice) };
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

describe('AmigaRdbInspectorTool UI and Samples', () => {
  it('renders initial empty state with sample controls', () => {
    render(<AmigaRdbInspectorTool />);

    expect(screen.getByRole('heading', { name: 'No Disk Image Loaded' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bad Checksum' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No RDSK' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Truncated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('loads the valid RDB sample with two partitions and geometry details', () => {
    render(<AmigaRdbInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid' }));

    expect(screen.getByText('Sample: Valid RDB')).toBeInTheDocument();
    // 5 occurrences of "Valid": 1 button + 4 status badges (overall, RDSK, DH0, DH1)
    expect(screen.getAllByText('Valid')).toHaveLength(5);
    expect(screen.getByText('QUANTUM')).toBeInTheDocument();
    expect(screen.getByText('FIREBALL 1.0')).toBeInTheDocument();
    expect(screen.getByText('DH0')).toBeInTheDocument();
    expect(screen.getByText('DH1')).toBeInTheDocument();
    expect(screen.getByText('DOS\\3 (0x444F5303)')).toBeInTheDocument();
    expect(screen.getByText('DOS\\1 (0x444F5301)')).toBeInTheDocument();
  });

  it('loads bad checksum sample and displays Invalid status', () => {
    render(<AmigaRdbInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Bad Checksum' }));

    expect(screen.getByText('Sample: Bad Checksum')).toBeInTheDocument();
    expect(screen.getAllByText('Invalid').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/Checksum mismatch/i);
  });

  it('loads no RDSK sample and displays Unknown status with diagnostic', () => {
    render(<AmigaRdbInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'No RDSK' }));

    expect(screen.getByText('Sample: No RDSK Magic')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'RDSK magic (0x5244534B) not found in the first 16 blocks.'
    );
  });

  it('loads truncated buffer sample and displays Unknown status with diagnostic', () => {
    render(<AmigaRdbInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Truncated' }));

    expect(screen.getByText('Sample: Truncated Buffer')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Truncated buffer: expected at least 512 bytes, got 128.'
    );
  });

  it('clears displayed data when Clear is clicked', () => {
    render(<AmigaRdbInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid' }));
    expect(screen.getByText('QUANTUM')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('QUANTUM')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No Disk Image Loaded' })).toBeInTheDocument();
  });
});

describe('AmigaRdbInspectorTool delayed-read stale results handling', () => {
  it('ignores a file read that resolves after Clear is clicked', async () => {
    const deferred = createDeferred();
    amigaRdbUtils.readRdbSlice.mockReturnValueOnce(deferred.promise);

    render(<AmigaRdbInspectorTool />);

    const sample = amigaRdbUtils.createValidSample();
    const file = new File([sample], 'disk.hdf', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload Amiga disk image');

    selectFile(fileInput, file);

    // User clears before async read finishes
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    // Resolve deferred file read
    await act(async () => {
      deferred.resolve(sample);
      await Promise.resolve();
    });

    // Should remain cleared
    expect(screen.queryByText('QUANTUM')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No Disk Image Loaded' })).toBeInTheDocument();
  });

  it('applies only the latest file when an older read resolves last', async () => {
    const deferredOld = createDeferred();
    const deferredNew = createDeferred();
    amigaRdbUtils.readRdbSlice
      .mockReturnValueOnce(deferredOld.promise)
      .mockReturnValueOnce(deferredNew.promise);

    render(<AmigaRdbInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Amiga disk image');
    const oldSample = amigaRdbUtils.createNoRdskSample();
    const newSample = amigaRdbUtils.createValidSample();

    const oldFile = new File([oldSample], 'old.hdf');
    const newFile = new File([newSample], 'new.hdf');

    selectFile(fileInput, oldFile);
    selectFile(fileInput, newFile);

    // Resolve new selection first
    await act(async () => {
      deferredNew.resolve(newSample);
      await Promise.resolve();
    });

    // Resolve old selection afterwards
    await act(async () => {
      deferredOld.resolve(oldSample);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('📁 new.hdf (8.00 KB)')).toBeInTheDocument();
      expect(screen.getByText('QUANTUM')).toBeInTheDocument();
    });
    expect(screen.queryByText('📁 old.hdf (8.00 KB)')).not.toBeInTheDocument();
  });
});
