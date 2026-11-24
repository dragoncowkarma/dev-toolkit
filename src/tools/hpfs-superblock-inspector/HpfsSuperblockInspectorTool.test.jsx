import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HpfsSuperblockInspectorTool from './HpfsSuperblockInspectorTool.jsx';
import * as hpfsUtils from './hpfs-superblock-inspector.utils.js';

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

describe('HpfsSuperblockInspectorTool rendering and basic interactions', () => {
  it('renders initial state with toolbar and hex textarea', () => {
    render(<HpfsSuperblockInspectorTool />);

    expect(
      screen.queryByRole('heading', { level: 3, name: /HPFS Superblock/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hex Data')).toBeInTheDocument();
    expect(screen.getByLabelText('Byte Offset:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('loads valid sample data on "Load Sample" click and renders superblock fields', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
    });

    expect(screen.getByText('0xF995E849')).toBeInTheDocument();
    expect(screen.getByText('0xFA53E9C5')).toBeInTheDocument();
    expect(screen.getByText('OS2_HPFS')).toBeInTheDocument();
    expect(screen.getAllByText('Version 2')).toHaveLength(2); // HPFS Version and Functional Version
    expect(screen.getByText('17')).toBeInTheDocument(); // spare block sector
    expect(screen.getByText('Dir Band Sector Count')).toBeInTheDocument();
    expect(screen.getByText('Bad-Block List Sector')).toBeInTheDocument();
    expect(screen.getByText('Last Chkdsk Date')).toBeInTheDocument();
  });

  it('displays diagnostic alert on truncated hex input without valid result', async () => {
    render(<HpfsSuperblockInspectorTool />);

    const textarea = screen.getByLabelText('Hex Data');
    fireEvent.change(textarea, { target: { value: '49 E8 95 F9 C5 E9 53 FA' } }); // only 8 bytes

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Truncated input/);
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();
  });

  it('displays diagnostic alert on bad superblock signature without valid result', async () => {
    render(<HpfsSuperblockInspectorTool />);

    // Generate a full 512-byte buffer with invalid magic
    const badBuffer = hpfsUtils.createHpfsSuperblockBuffer({ magic: 0x12345678 });
    const hex = hpfsUtils.bytesToHex(badBuffer);

    const textarea = screen.getByLabelText('Hex Data');
    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid HPFS superblock signature/);
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();
  });

  it('displays diagnostic alert on unknown version without valid result', async () => {
    render(<HpfsSuperblockInspectorTool />);

    const unknownVerBuffer = hpfsUtils.createHpfsSuperblockBuffer({ version: 99 });
    const hex = hpfsUtils.bytesToHex(unknownVerBuffer);

    const textarea = screen.getByLabelText('Hex Data');
    fireEvent.change(textarea, { target: { value: hex } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Unknown HPFS version: 99/);
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();
  });

  it('displays diagnostic alert on malformed byte offset input', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('Valid Superblock')).toBeInTheDocument());

    const offsetInput = screen.getByLabelText('Byte Offset:');
    fireEvent.change(offsetInput, { target: { value: '12junk' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid byte offset/);
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();

    fireEvent.change(offsetInput, { target: { value: '0x2000zz' } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid byte offset/);
    });

    fireEvent.change(offsetInput, { target: { value: '1.5' } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid byte offset/);
    });
  });

  it('clears all inputs, parsed results, and errors on "Clear" button click', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('Valid Superblock')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Hex Data')).toHaveValue('');
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('HpfsSuperblockInspectorTool file upload and async slicing', () => {
  it('switches to file upload mode and displays file info', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    expect(screen.getByText(/No file selected/)).toBeInTheDocument();

    const sampleBuffer = hpfsUtils.createHpfsSuperblockBuffer({ volumeName: 'UPLOAD_TEST' });
    const file = new File([sampleBuffer], 'hpfs_image.img', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');

    await act(async () => {
      selectFile(fileInput, file);
    });

    await waitFor(() => {
      expect(screen.getByText('UPLOAD_TEST')).toBeInTheDocument();
    });

    expect(screen.getByText(/hpfs_image\.img/)).toBeInTheDocument();
    expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
  });

  it(
    'parses full image file with explicit offset, preserving absolute location and boot block',
    async () => {
      render(<HpfsSuperblockInspectorTool />);

      fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

      // Create a full HPFS partition image
      // (sector 0: boot block, sector 16: superblock, sector 17: spare block)
      const fullImageBytes = hpfsUtils.createHpfsPartitionImageBuffer({
        bootBlock: {
          oemId: 'IBM 4.0',
          volumeLabel: 'FULL_IMG',
          systemId: 'HPFS',
        },
        superblock: {
          volumeName: 'OS2_FULL',
          nDirBand: 1600,
          dirBandStart: 102400,
          dirBandEnd: 103999,
          dirBandBitmap: 120,
        },
        spareBlock: {
          dirty: false,
          usedHotfixes: 5,
          totalHotfixes: 99,
          codePageDir: 777,
        },
      });

      const file = new File([fullImageBytes], 'full_hpfs.img', {
        type: 'application/octet-stream',
      });
      const offsetInput = screen.getByLabelText('Byte Offset:');
      fireEvent.change(offsetInput, { target: { value: '8192' } });

      const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');
      await act(async () => {
        selectFile(fileInput, file);
      });

      await waitFor(() => {
        expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
      });

      // Check that superblock location reports offset 8192 / Sector 16
      expect(screen.getByText(/Offset 0x2000 \(8192 bytes, Sector 16\)/)).toBeInTheDocument();
      expect(screen.getByText('OS2_FULL')).toBeInTheDocument();

      // Check directory band fields
      expect(screen.getByText('102400')).toBeInTheDocument();
      expect(screen.getByText('103999')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();

      // Check that Boot Block (Sector 0) is parsed and rendered
      expect(screen.getByText('Boot Block (Sector 0)')).toBeInTheDocument();
      expect(screen.getByText('IBM 4.0')).toBeInTheDocument();
      expect(screen.getByText('FULL_IMG')).toBeInTheDocument();

      // Check that Spare Block (Sector 17) is parsed and rendered
      expect(screen.getByText('Spare Block (Sector 17)')).toBeInTheDocument();
      expect(screen.getByText('Used Hotfixes')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Total Hotfix Spares')).toBeInTheDocument();
      expect(screen.getByText('99')).toBeInTheDocument();
      expect(screen.getByText('777')).toBeInTheDocument();
    }
  );

  it(
    'reads boot sector for selected superblock in disk image with MBR and nonzero partition',
    async () => {
      render(<HpfsSuperblockInspectorTool />);

      fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

      const partitionStart = 65536; // 128 sectors (nonzero partition start byte P)
      const superblockOffset = partitionStart + 8192; // Sector 144 (0x12000)
      const totalSize = partitionStart + 18 * hpfsUtils.HPFS_SECTOR_SIZE;
      const diskImageBytes = new Uint8Array(totalSize);

      // Signed MBR at sector 0 (offset 0..511) ending in 0xAA55
      diskImageBytes[0] = 0xfa; // CLI
      diskImageBytes[1] = 0x33; // XOR AX, AX
      diskImageBytes[2] = 0xc0;
      diskImageBytes[510] = 0x55;
      diskImageBytes[511] = 0xaa;

      // HPFS partition image starting at partitionStart (65536)
      const partitionBytes = hpfsUtils.createHpfsPartitionImageBuffer({
        bootBlock: {
          oemId: 'IBM 4.0',
          volumeLabel: 'PART_BOOT',
          systemId: 'HPFS',
        },
        superblock: {
          volumeName: 'OS2_NONZERO',
        },
        spareBlock: {
          dirty: false,
        },
      });
      diskImageBytes.set(partitionBytes, partitionStart);

      const file = new File([diskImageBytes], 'disk_with_mbr.img', {
        type: 'application/octet-stream',
      });

      const offsetInput = screen.getByLabelText('Byte Offset:');
      fireEvent.change(offsetInput, {
        target: { value: `0x${superblockOffset.toString(16)}` },
      });

      const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');
      await act(async () => {
        selectFile(fileInput, file);
      });

      await waitFor(() => {
        expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
      });

      // Verify superblock was parsed from the nonzero offset (0x12000 / 73728)
      expect(
        screen.getByText(new RegExp(`Offset 0x${superblockOffset.toString(16).toUpperCase()}`))
      ).toBeInTheDocument();
      expect(screen.getByText('OS2_NONZERO')).toBeInTheDocument();

      // Verify partition boot block was read from partitionStart (not MBR from offset 0)
      expect(screen.getByText('Boot Block (Sector 0)')).toBeInTheDocument();
      expect(screen.getByText('IBM 4.0')).toBeInTheDocument();
      expect(screen.getByText('PART_BOOT')).toBeInTheDocument();
      expect(screen.getByText('HPFS')).toBeInTheDocument();
    }
  );

  it('does not attribute an unrelated sector as boot block for isolated superblock', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

    const sbBytes = hpfsUtils.createHpfsSuperblockBuffer({ volumeName: 'ISOLATED_SB' });
    const file = new File([sbBytes], 'isolated.sb', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');

    await act(async () => {
      selectFile(fileInput, file);
    });

    await waitFor(() => {
      expect(screen.getByText('ISOLATED_SB')).toBeInTheDocument();
    });

    expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
    expect(screen.queryByText('Boot Block (Sector 0)')).not.toBeInTheDocument();
  });

  it('rejects malformed offset in file mode and sets error alert', async () => {
    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    const sampleBuffer = hpfsUtils.createHpfsSuperblockBuffer();
    const file = new File([sampleBuffer], 'hpfs.img');
    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');

    await act(async () => {
      selectFile(fileInput, file);
    });
    await waitFor(() => expect(screen.getByText('Valid Superblock')).toBeInTheDocument());

    const offsetInput = screen.getByLabelText('Byte Offset:');
    fireEvent.change(offsetInput, { target: { value: '0x2000zz' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid byte offset/);
  });

  it('clears results and displays loading indicator while reading file slice', async () => {
    const deferred = createDeferred();
    vi.spyOn(hpfsUtils, 'readSlice').mockImplementation(() => deferred.promise);

    render(<HpfsSuperblockInspectorTool />);

    const sampleBuffer = hpfsUtils.createHpfsSuperblockBuffer();
    const file = new File([sampleBuffer], 'test.img', { type: 'application/octet-stream' });
    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');

    act(() => {
      selectFile(fileInput, file);
    });

    expect(screen.getByText(/Reading file slice asynchronously/)).toBeInTheDocument();
    expect(screen.queryByText('Valid Superblock')).not.toBeInTheDocument();

    await act(async () => {
      deferred.resolve(sampleBuffer);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Reading file slice asynchronously/)).not.toBeInTheDocument();
      expect(screen.getByText('Valid Superblock')).toBeInTheDocument();
    });
  });

  it('discards stale file read results if a new read or clear occurs in flight', async () => {
    const deferred1 = createDeferred();
    const deferred2 = createDeferred();

    vi.spyOn(hpfsUtils, 'readSlice')
      .mockImplementationOnce(() => deferred1.promise)
      .mockImplementationOnce(() => deferred2.promise);

    render(<HpfsSuperblockInspectorTool />);

    const file1 = new File([new Uint8Array(512)], 'file1.img');
    const sampleSb = hpfsUtils.createHpfsSuperblockBuffer({ volumeName: 'SECOND_FILE' });
    const file2 = new File([sampleSb], 'file2.img');
    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');

    // First file read starts
    act(() => {
      selectFile(fileInput, file1);
    });

    // Second file read starts before first completes
    act(() => {
      selectFile(fileInput, file2);
    });

    // Complete the first (now stale) read with bad buffer
    await act(async () => {
      deferred1.resolve(new Uint8Array(512));
    });

    // Verify first result did NOT overwrite or set error for second
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Complete second read with valid buffer
    await act(async () => {
      deferred2.resolve(hpfsUtils.createHpfsSuperblockBuffer({ volumeName: 'SECOND_FILE' }));
    });

    await waitFor(() => {
      expect(screen.getByText('SECOND_FILE')).toBeInTheDocument();
    });
  });

  it('handles keyboard accessibility with visible focus styling for file input', () => {
    render(<HpfsSuperblockInspectorTool />);

    const fileInput = screen.getByLabelText('Upload HPFS image or superblock file');
    const label = fileInput.closest('label');

    expect(label).toHaveClass('file-btn');
    expect(fileInput).toHaveClass('file-input');
  });

  it('copies JSON summary to clipboard and displays accessible live status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<HpfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => expect(screen.getByText('Valid Superblock')).toBeInTheDocument());

    const copyBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });
});
