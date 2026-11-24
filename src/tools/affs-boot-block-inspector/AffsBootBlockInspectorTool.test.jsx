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
});
