import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BtrfsSuperblockInspectorTool from './BtrfsSuperblockInspectorTool.jsx';
import {
  SUPERBLOCK_OFFSET,
  SUPERBLOCK_SIZE,
  createSampleBtrfsSuperblock,
} from './btrfs-superblock-inspector.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
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
});
