import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReiserfsSuperblockInspectorTool from './ReiserfsSuperblockInspectorTool.jsx';
import * as utils from './reiserfs-superblock-inspector.utils.js';

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

describe('ReiserfsSuperblockInspectorTool - Initial render', () => {
  it('renders tool header, mode buttons, offset input, samples, and clear button', () => {
    render(<ReiserfsSuperblockInspectorTool />);

    expect(screen.getByRole('button', { name: 'Hex Dump' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'File Upload' })).not.toHaveClass('active');
    expect(screen.getByLabelText(/Superblock Offset/i)).toHaveValue(0);
    expect(screen.getByLabelText(/Paste Superblock Hex Dump/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valid 3.6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Valid 3.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corrupt Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled();
  });
});

describe('ReiserfsSuperblockInspectorTool - Sample buttons', () => {
  it('loads valid 3.6 sample and renders parsed metadata', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.6' }));

    await waitFor(() => {
      expect(screen.getByText('1.00 GiB')).toBeInTheDocument();
    });

    expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
    expect(screen.getByText('3.6 format')).toBeInTheDocument();
    expect(screen.getByText('R5 (3)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeEnabled();
  });

  it('loads valid 3.5 sample and renders Yura hash and 3.5 format', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.5' }));

    await waitFor(() => {
      expect(screen.getByText('ReIsErFs')).toBeInTheDocument();
    });

    expect(screen.getByText('3.5 format')).toBeInTheDocument();
    expect(screen.getByText('Yura (2)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ReiserfsSuperblockInspectorTool - Corrupt sample diagnostics', () => {
  it('loads corrupt sample and displays diagnostics without crashing', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Corrupt Sample' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Invalid magic string "BADMAGIC!"/);
    expect(alert).toHaveTextContent(/Invalid block size: 3000 bytes/);
    expect(alert).toHaveTextContent(/Free blocks \(5000\) cannot exceed total block count/);
    expect(alert).toHaveTextContent(/Unknown hash function code: 99/);
  });
});

describe('ReiserfsSuperblockInspectorTool - Invalid hex input', () => {
  it('displays diagnostic on invalid non-hex characters', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    const textarea = screen.getByLabelText(/Paste Superblock Hex Dump/i);
    fireEvent.change(textarea, { target: { value: 'not-a-hex-string!' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/non-hexadecimal character/);
    });
  });

  it('displays diagnostic on odd number of hex digits', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    const textarea = screen.getByLabelText(/Paste Superblock Hex Dump/i);
    fireEvent.change(textarea, { target: { value: '123' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/odd number of digits/);
    });
  });
});

describe('ReiserfsSuperblockInspectorTool - Mode switching and loading states', () => {
  it('clears previous hex results when switching to File Upload without a file', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.6' }));
    await waitFor(() => {
      expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
      expect(screen.getByText('1.00 GiB')).toBeInTheDocument();
    });

    // Switch to File Upload without selecting a file
    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

    // Prior result must be cleared immediately
    expect(screen.queryByText('ReIsEr2Fs')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00 GiB')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled();
  });

  it('clears previous results and shows loading state while read is in progress', async () => {
    const deferred1 = createDeferred();
    const deferred2 = createDeferred();
    vi.spyOn(utils, 'readFileSlice')
      .mockReturnValueOnce(deferred1.promise)
      .mockReturnValueOnce(deferred2.promise);

    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const file = new File(['disk-data'], 'disk.img');
    const fileInput = screen.getByLabelText('Upload ReiserFS file');

    // First file read starts
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Should show loading status while in flight
    expect(screen.getByRole('status')).toHaveTextContent(/Reading superblock data.../);

    // Resolve first read
    const sample1 = utils.buildSampleSuperblock({
      magic: 'ReIsEr2Fs',
      blockCount: 262144,
      freeBlocks: 196608,
    });
    await act(async () => {
      deferred1.resolve(sample1);
    });

    await waitFor(() => {
      expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
      expect(screen.getByText('1.00 GiB')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Reading superblock data.../)).not.toBeInTheDocument();

    // Now change offset: must clear prior result or display loading state immediately
    const offsetInput = screen.getByLabelText(/Superblock Offset/i);
    await act(async () => {
      fireEvent.change(offsetInput, { target: { value: '131072' } });
    });

    expect(screen.getByRole('status')).toHaveTextContent(/Reading superblock data.../);
    expect(screen.queryByText('ReIsEr2Fs')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00 GiB')).not.toBeInTheDocument();

    // Resolve second read with 3.5 superblock
    const sample2 = utils.buildSampleSuperblock({
      magic: 'ReIsErFs',
      version: 1,
      blockCount: 131072,
      freeBlocks: 98304,
    });
    await act(async () => {
      deferred2.resolve(sample2);
    });

    await waitFor(() => {
      expect(screen.getByText('ReIsErFs')).toBeInTheDocument();
      expect(screen.getByText('512.00 MiB')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Reading superblock data.../)).not.toBeInTheDocument();
  });
});

describe('ReiserfsSuperblockInspectorTool - Keyboard accessibility', () => {
  it('allows file picker to be focused via keyboard and triggered with Enter', () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

    const fileInput = screen.getByLabelText('Upload ReiserFS file');
    expect(fileInput).toHaveClass('reiserfs-file-input');
    expect(fileInput).not.toHaveStyle({ display: 'none' });

    // Focus file input and verify DOM structure supports adjacent sibling focus styling
    fileInput.focus();
    expect(document.activeElement).toBe(fileInput);
    expect(fileInput.nextElementSibling).toHaveClass('reiserfs-file-btn');

    // Verify keyboard activation triggers file chooser click
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.keyDown(fileInput, { key: 'Enter', code: 'Enter' });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(fileInput, { key: ' ', code: 'Space' });
    expect(clickSpy).toHaveBeenCalledTimes(2);
    clickSpy.mockRestore();
  });
});

describe('ReiserfsSuperblockInspectorTool - File mode and File.slice', () => {
  it('switches to file mode and reads superblock slice from file', async () => {
    const mockSample = utils.buildSampleSuperblock({
      magic: 'ReIsEr2Fs',
      blockCount: 1048576,
      freeBlocks: 524288,
      blockSize: 4096,
    });
    vi.spyOn(utils, 'readFileSlice').mockResolvedValue(mockSample);

    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    expect(screen.getByLabelText(/Superblock Offset/i)).toHaveValue(utils.REISERFS_DEFAULT_OFFSET);

    const file = new File(['dummy-content'], 'disk.img', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload ReiserFS file');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByText('4.00 GiB')).toBeInTheDocument();
    });

    expect(utils.readFileSlice).toHaveBeenCalledWith(
      file,
      utils.REISERFS_DEFAULT_OFFSET,
      utils.BOUNDED_SLICE_BYTES
    );
    expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
    expect(screen.getByText(/Selected: disk.img/)).toBeInTheDocument();
  });
});

describe('ReiserfsSuperblockInspectorTool - Stale read handling', () => {
  it('ignores completed file read if Clear was clicked while read was in flight', async () => {
    const deferred = createDeferred();
    vi.spyOn(utils, 'readFileSlice').mockReturnValue(deferred.promise);

    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const file = new File(['disk-data'], 'disk.img');
    const fileInput = screen.getByLabelText('Upload ReiserFS file');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Clear is clicked before deferred resolves
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const sample = utils.buildSampleSuperblock({ magic: 'ReIsEr2Fs' });
    await act(async () => {
      deferred.resolve(sample);
    });

    // Should NOT display metadata from stale read
    expect(screen.queryByText('ReIsEr2Fs')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00 GiB')).not.toBeInTheDocument();
  });
});

describe('ReiserfsSuperblockInspectorTool - Clear button', () => {
  it('resets inputs, parsed results, and diagnostics', async () => {
    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.6' }));
    await waitFor(() => {
      expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText(/Paste Superblock Hex Dump/i)).toHaveValue('');
    expect(screen.queryByText('ReIsEr2Fs')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled();
  });
});

describe('ReiserfsSuperblockInspectorTool - Copy JSON clipboard', () => {
  it('copies JSON to clipboard and triggers feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.6' }));
    await waitFor(() => {
      expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    const parsedPayload = JSON.parse(writeText.mock.calls[0][0]);
    expect(parsedPayload.superblock.magic).toBe('ReIsEr2Fs');
    expect(screen.getByRole('button', { name: '✓ Copied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('reports clipboard copy failure gracefully', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ReiserfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Valid 3.6' }));
    await waitFor(() => {
      expect(screen.getByText('ReIsEr2Fs')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(screen.getByText('Failed to copy JSON to clipboard.')).toBeInTheDocument();
  });
});

describe('ReiserfsSuperblockInspectorTool - Offset presets', () => {
  it('updates offset when clicking preset buttons', () => {
    render(<ReiserfsSuperblockInspectorTool />);

    const offsetInput = screen.getByLabelText(/Superblock Offset/i);
    expect(offsetInput).toHaveValue(0);

    fireEvent.click(screen.getByRole('button', { name: 'Disk Image (64 KiB)' }));
    expect(offsetInput).toHaveValue(65536);

    fireEvent.click(screen.getByRole('button', { name: 'Standalone (0)' }));
    expect(offsetInput).toHaveValue(0);
  });
});
