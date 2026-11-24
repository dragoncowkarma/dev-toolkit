import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AffsBootBlockInspectorTool from './AffsBootBlockInspectorTool.jsx';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
});

describe('AffsBootBlockInspectorTool', () => {
  it('renders initial toolbar and empty state', () => {
    render(<AffsBootBlockInspectorTool />);

    expect(screen.getByText('Upload Disk / Boot Block')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load 880 KB FFS Floppy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load OFS Boot Block' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load Corrupt Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('loads 880 KB FFS floppy sample and displays boot and root block details', async () => {
    render(<AffsBootBlockInspectorTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load 880 KB FFS Floppy' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Amiga Boot Block/)).toBeInTheDocument();
    });

    // Boot Block Details
    expect(screen.getByText(/DOS1/)).toBeInTheDocument();
    expect(screen.getByText(/Fast File System \(FFS\)/)).toBeInTheDocument();
    expect(screen.getByText('✓ Checksum Valid')).toBeInTheDocument();
    expect(screen.getByText(/Sector 880 \(Byte offset/)).toBeInTheDocument();

    // Root Block Details
    expect(screen.getByText(/Root Block \(Sector 880\)/)).toBeInTheDocument();
    expect(screen.getByText('✓ Validated')).toBeInTheDocument();
    expect(screen.getByText('Workbench')).toBeInTheDocument();
    expect(screen.getByText(/Valid \(-1 \/ 0xFFFFFFFF\)/)).toBeInTheDocument();
  });

  it('loads OFS boot block sample and shows file size info banner without root block', async () => {
    render(<AffsBootBlockInspectorTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load OFS Boot Block' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Amiga Boot Block/)).toBeInTheDocument();
    });

    expect(screen.getByText(/DOS0/)).toBeInTheDocument();
    expect(screen.getByText(/Old File System \(OFS\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Root block inspection requires at least 1760 sectors/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Root Block \(Sector 880\)/)).not.toBeInTheDocument();
  });

  it('loads corrupt checksum sample and shows checksum mismatch badge', async () => {
    render(<AffsBootBlockInspectorTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load Corrupt Sample' }));
    });

    await waitFor(() => {
      expect(screen.getByText('✗ Checksum Mismatch')).toBeInTheDocument();
    });
  });

  it('displays an error alert on empty file upload', async () => {
    render(<AffsBootBlockInspectorTool />);

    const emptyFile = new File([], 'empty.adf');
    const input = screen.getByLabelText('Upload Amiga disk image or boot block file');

    await act(async () => {
      selectFile(input, emptyFile);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/File is empty/);
    });
  });

  it('displays an error alert on truncated file upload', async () => {
    render(<AffsBootBlockInspectorTool />);

    const truncated = new Uint8Array(200);
    const truncFile = new File([truncated], 'truncated.bin');
    const input = screen.getByLabelText('Upload Amiga disk image or boot block file');

    await act(async () => {
      selectFile(input, truncFile);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Truncated boot block/);
    });
  });

  it('displays an error alert on invalid magic', async () => {
    render(<AffsBootBlockInspectorTool />);

    const badMagic = new Uint8Array(1024);
    badMagic[0] = 0x4e; // 'N'
    badMagic[1] = 0x44; // 'D'
    badMagic[2] = 0x4f; // 'O'
    badMagic[3] = 0x53; // 'S'
    const badFile = new File([badMagic], 'badmagic.bin');
    const input = screen.getByLabelText('Upload Amiga disk image or boot block file');

    await act(async () => {
      selectFile(input, badFile);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid DOS magic/);
    });
  });

  it('clears state when Clear button is clicked', async () => {
    render(<AffsBootBlockInspectorTool />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load OFS Boot Block' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/DOS0/)).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(screen.queryByText(/Amiga Boot Block/)).not.toBeInTheDocument();
    expect(clearBtn).toBeDisabled();
  });

  it('reports error when pointer is out of range, and validates on midpoint', async () => {
    // Build floppy with out-of-range rootblockPtr (4000) and valid root block at sector 880
    const disk = new Uint8Array(1760 * 512);
    disk[0] = 0x44; // 'D'
    disk[1] = 0x4f; // 'O'
    disk[2] = 0x53; // 'S'
    disk[3] = 0x07; // DOS7 (FFS Long Filenames)
    disk[8] = 0x00;
    disk[9] = 0x00;
    disk[10] = 0x0f;
    disk[11] = 0xa0; // 4000
    // Checksum for boot block
    let csSum = 0;
    for (let o = 0; o < 1024; o += 4) {
      if (o === 4) continue;
      const w = ((disk[o] << 24) | (disk[o + 1] << 16) | (disk[o + 2] << 8) | disk[o + 3]) >>> 0;
      const prev = csSum;
      csSum = (csSum + w) >>> 0;
      if (csSum < prev) csSum = (csSum + 1) >>> 0;
    }
    const cs = (~csSum) >>> 0;
    disk[4] = (cs >> 24) & 0xff;
    disk[5] = (cs >> 16) & 0xff;
    disk[6] = (cs >> 8) & 0xff;
    disk[7] = cs & 0xff;

    // Root block at sector 880
    const rootOffset = 880 * 512;
    disk[rootOffset + 3] = 2; // primary type 2
    disk[rootOffset + 511] = 1; // secondary type 1
    disk[rootOffset + 312] = 0xff;
    disk[rootOffset + 313] = 0xff;
    disk[rootOffset + 314] = 0xff;
    disk[rootOffset + 315] = 0xff;
    disk[rootOffset + 432] = 8;
    const name = 'Recovery';
    for (let i = 0; i < 8; i += 1) {
      disk[rootOffset + 433 + i] = name.charCodeAt(i);
    }
    let rSum = 0;
    for (let o = 0; o < 512; o += 4) {
      if (o === 20) continue;
      const w =
        ((disk[rootOffset + o] << 24) |
          (disk[rootOffset + o + 1] << 16) |
          (disk[rootOffset + o + 2] << 8) |
          disk[rootOffset + o + 3]) >>>
        0;
      rSum = (rSum + w) >>> 0;
    }
    const rCs = (-rSum) >>> 0;
    disk[rootOffset + 20] = (rCs >> 24) & 0xff;
    disk[rootOffset + 21] = (rCs >> 16) & 0xff;
    disk[rootOffset + 22] = (rCs >> 8) & 0xff;
    disk[rootOffset + 23] = rCs & 0xff;

    const file = new File([disk], 'damaged_ptr.adf');
    render(<AffsBootBlockInspectorTool />);

    const input = screen.getByLabelText('Upload Amiga disk image or boot block file');
    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByText(/DOS7/)).toBeInTheDocument();
    });

    // Check that DOS7 shows Long Filenames Enabled
    expect(screen.getByText('Enabled (LN)')).toBeInTheDocument();

    // In default pointer mode: target sector is 4000 and untrusted error is displayed
    expect(screen.getByText('Root Block (Sector 4000)')).toBeInTheDocument();
    expect(screen.getByText('✗ Untrusted / Invalid')).toBeInTheDocument();
    expect(screen.getByText(/Root block pointer sector 4000 is out of range/)).toBeInTheDocument();

    // Now switch root block location to midpoint
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'midpoint' } });
    });

    await waitFor(() => {
      expect(screen.getByText('Root Block (Sector 880)')).toBeInTheDocument();
    });
    expect(screen.getByText('✓ Validated')).toBeInTheDocument();
    expect(screen.getByText('Recovery')).toBeInTheDocument();
  });
});
