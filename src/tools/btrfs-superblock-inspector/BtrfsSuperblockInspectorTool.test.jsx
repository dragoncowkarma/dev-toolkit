import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BtrfsSuperblockInspectorTool from './BtrfsSuperblockInspectorTool.jsx';
import * as btrfsUtils from './btrfs-superblock-inspector.utils.js';
import {
  SUPERBLOCK_OFFSET,
  SUPERBLOCK_SIZE,
  createSampleBtrfsSuperblock,
} from './btrfs-superblock-inspector.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createFakeParsed(label, fileName) {
  const buf = createSampleBtrfsSuperblock({ label });
  const parsed = btrfsUtils.parseBtrfsSuperblock(buf);
  return {
    ...parsed,
    fileInfo: {
      name: fileName,
      size: 1048576,
      sliceOffset: SUPERBLOCK_OFFSET,
      sliceSize: SUPERBLOCK_SIZE,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BtrfsSuperblockInspectorTool', () => {
  it('renders initial empty state with upload, sample, and disabled clear buttons', () => {
    render(<BtrfsSuperblockInspectorTool />);

    expect(
      screen.getByRole('button', { name: 'Load Sample' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload Btrfs filesystem image')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
      screen.getByText(/Select a Btrfs filesystem image file or click “Load Sample” to inspect./i)
    ).toBeInTheDocument();
  });

  it('loads sample superblock and displays parsed metadata on "Load Sample"', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    await waitFor(() => {
      expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument();
    });

    expect(screen.getByText('📁 sample-btrfs.img')).toBeInTheDocument();
    expect(screen.getByText(/Actual Image Size: 20.0 GB/)).toBeInTheDocument();
    expect(screen.getByText('_BHRfS_M')).toBeInTheDocument();
    expect(screen.getAllByText('4096 bytes').length).toBeGreaterThan(0);
    expect(screen.getByText('SKINNY_METADATA')).toBeInTheDocument();
    expect(screen.getByText('NO_HOLES')).toBeInTheDocument();
    expect(screen.getByText('FREE_SPACE_TREE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('handles file upload with valid Btrfs image and reports actual file size', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    const totalImageSize = 1048576; // 1 MiB
    const imageBytes = new Uint8Array(totalImageSize);
    const validSb = createSampleBtrfsSuperblock({ label: 'my-custom-volume' });
    imageBytes.set(validSb, SUPERBLOCK_OFFSET);

    const file = new File([imageBytes], 'disk.img', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');

    await act(async () => {
      selectFile(fileInput, file);
    });

    await waitFor(() => {
      expect(screen.getByText('my-custom-volume')).toBeInTheDocument();
    });

    expect(screen.getByText('📁 disk.img')).toBeInTheDocument();
    expect(screen.getByText(/Actual Image Size: 1.0 MB \(1,048,576 bytes\)/)).toBeInTheDocument();
  });

  it('displays clear error on bad magic and resets state on failed selection', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    // Load sample first to establish active state
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument());

    const badImage = new Uint8Array(SUPERBLOCK_OFFSET + SUPERBLOCK_SIZE);
    const badFile = new File([badImage], 'corrupt.img');
    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');

    await act(async () => {
      selectFile(fileInput, badFile);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        "Invalid Btrfs superblock: magic '_BHRfS_M' not found"
      );
    });

    // Previous data should be cleared
    expect(screen.queryByText('btrfs-data-volume')).not.toBeInTheDocument();
  });

  it('displays clear error on truncated file input', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    const tinyFile = new File([new Uint8Array(512)], 'tiny.bin');
    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');

    await act(async () => {
      selectFile(fileInput, tinyFile);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Truncated image: file size (512 B) is too small to contain a Btrfs superblock'
      );
    });
  });

  it('resets state when file selection is cleared or cancelled', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument());

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    // Change with no files (cancelled selection)
    Object.defineProperty(fileInput, 'files', { value: [], configurable: true });
    fireEvent.change(fileInput);

    expect(screen.queryByText('btrfs-data-volume')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears all state when clicking "Clear"', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText('btrfs-data-volume')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
      screen.getByText(/Select a Btrfs filesystem image file or click “Load Sample” to inspect./i)
    ).toBeInTheDocument();
  });

  it('copies FSID and checksum to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<BtrfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument());

    const copyFsidBtn = screen.getByRole('button', { name: 'Copy FSID' });
    await act(async () => {
      fireEvent.click(copyFsidBtn);
    });

    expect(writeText).toHaveBeenCalledWith('4a7f19b8-2341-4f92-89ac-56ef78901234');
    expect(copyFsidBtn).toHaveTextContent('✓ Copied');
  });

  it('ignores obsolete file read on out-of-order success', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    await act(async () => {
      resolveSecond(createFakeParsed('second-volume', 'second.img'));
    });

    await waitFor(() => {
      expect(screen.getByText('second-volume')).toBeInTheDocument();
      expect(screen.getByText('📁 second.img')).toBeInTheDocument();
    });

    await act(async () => {
      resolveFirst(createFakeParsed('first-volume', 'first.img'));
    });

    expect(screen.getByText('second-volume')).toBeInTheDocument();
    expect(screen.getByText('📁 second.img')).toBeInTheDocument();
    expect(screen.queryByText('first-volume')).not.toBeInTheDocument();
    expect(screen.queryByText('📁 first.img')).not.toBeInTheDocument();
  });

  it('ignores obsolete file read error on out-of-order failure', async () => {
    let rejectFirst;
    const firstPromise = new Promise((_, reject) => {
      rejectFirst = reject;
    });

    let resolveSecond;
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    await act(async () => {
      resolveSecond(createFakeParsed('second-volume', 'second.img'));
    });

    await waitFor(() => {
      expect(screen.getByText('second-volume')).toBeInTheDocument();
    });

    await act(async () => {
      rejectFirst(new Error('First read disk error'));
    });

    expect(screen.getByText('second-volume')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores obsolete file read success when a newer file read fails', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let rejectSecond;
    const secondPromise = new Promise((_, reject) => {
      rejectSecond = reject;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage')
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const firstFile = new File(['first'], 'first.img');
    const secondFile = new File(['second'], 'second.img');

    selectFile(fileInput, firstFile);
    selectFile(fileInput, secondFile);

    await act(async () => {
      rejectSecond(new Error('Corrupt second image'));
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Corrupt second image');
    });

    await act(async () => {
      resolveFirst(createFakeParsed('first-volume', 'first.img'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Corrupt second image');
    expect(screen.queryByText('first-volume')).not.toBeInTheDocument();
  });

  it('ignores pending file read when Clear is clicked', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage').mockReturnValueOnce(firstPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    await act(async () => {
      resolveFirst(createFakeParsed('delayed-volume', 'delayed.img'));
    });

    expect(screen.queryByText('delayed-volume')).not.toBeInTheDocument();
    expect(screen.queryByText('📁 delayed.img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
      screen.getByText(/Select a Btrfs filesystem image file or click “Load Sample” to inspect./i)
    ).toBeInTheDocument();
  });

  it('ignores pending file read when Load Sample is clicked', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage').mockReturnValueOnce(firstPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    await waitFor(() => {
      expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument();
      expect(screen.getByText('📁 sample-btrfs.img')).toBeInTheDocument();
    });

    await act(async () => {
      resolveFirst(createFakeParsed('delayed-volume', 'delayed.img'));
    });

    expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument();
    expect(screen.getByText('📁 sample-btrfs.img')).toBeInTheDocument();
    expect(screen.queryByText('delayed-volume')).not.toBeInTheDocument();
  });

  it('ignores pending file read when file selection is cleared/cancelled', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage').mockReturnValueOnce(firstPromise);

    render(<BtrfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const file = new File(['first'], 'delayed.img');

    selectFile(fileInput, file);

    Object.defineProperty(fileInput, 'files', { value: [], configurable: true });
    fireEvent.change(fileInput);

    await act(async () => {
      resolveFirst(createFakeParsed('delayed-volume', 'delayed.img'));
    });

    expect(screen.queryByText('delayed-volume')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores replacement read resolving after clearing already displayed result', async () => {
    render(<BtrfsSuperblockInspectorTool />);

    // Load sample first
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument();
    });

    let resolveReplacement;
    const replacementPromise = new Promise((resolve) => {
      resolveReplacement = resolve;
    });

    vi.spyOn(btrfsUtils, 'readSuperblockFromImage').mockReturnValueOnce(replacementPromise);

    const fileInput = screen.getByLabelText('Upload Btrfs filesystem image');
    const replacementFile = new File(['replacement'], 'replacement.img');
    selectFile(fileInput, replacementFile);

    // Clear while replacement read is pending
    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    // Now resolve replacement read
    await act(async () => {
      resolveReplacement(createFakeParsed('replacement-volume', 'replacement.img'));
    });

    // Should remain cleared
    expect(screen.queryByText('btrfs-data-volume')).not.toBeInTheDocument();
    expect(screen.queryByText('replacement-volume')).not.toBeInTheDocument();
    expect(screen.queryByText('📁 replacement.img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(
      screen.getByText(/Select a Btrfs filesystem image file or click “Load Sample” to inspect./i)
    ).toBeInTheDocument();
  });
});

describe('hex inspection', () => {
  it('inspects hex and clears stale results when input changes or is invalid', () => {
    render(<BtrfsSuperblockInspectorTool />);
    const hex = Array.from(createSampleBtrfsSuperblock(), (b) => b.toString(16).padStart(2, '0'))
      .join('');
    const input = screen.getByLabelText('Superblock or image hex');
    fireEvent.change(input, { target: { value: hex } });
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Hex' }));
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('btrfs-data-volume')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(screen.queryByText('btrfs-data-volume')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Hex' }));
    expect(screen.getByRole('alert')).toHaveTextContent('hexadecimal');
  });

  it('ignores an earlier file read after hex input changes', async () => {
    let resolveRead;
    vi.spyOn(btrfsUtils, 'readSuperblockFromImage').mockReturnValue(new Promise((resolve) => {
      resolveRead = resolve;
    }));
    render(<BtrfsSuperblockInspectorTool />);
    selectFile(screen.getByLabelText('Upload Btrfs filesystem image'), new File(['x'], 'old.img'));
    fireEvent.change(screen.getByLabelText('Superblock or image hex'), { target: { value: '00' } });
    await act(async () => resolveRead(createFakeParsed('stale-volume', 'old.img')));
    expect(screen.queryByText('stale-volume')).not.toBeInTheDocument();
  });
});
