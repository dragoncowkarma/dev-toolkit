import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VectrexRomHeaderInspectorTool from './VectrexRomHeaderInspectorTool.jsx';
import * as utils from './vectrex-rom-header-inspector.utils.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VectrexRomHeaderInspectorTool UI', () => {
  it('renders initial state with file upload and sample buttons', () => {
    render(<VectrexRomHeaderInspectorTool />);

    expect(
      screen.getByRole('region', { name: 'Vectrex ROM Header Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Vectrex ROM file')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Drop ROM file here or click to browse' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mine Storm (Valid 8 KiB)' })).toBeInTheDocument();
  });

  it('loads and displays a valid Vectrex ROM sample (Mine Storm)', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Mine Storm (Valid 8 KiB)' }));

    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    expect(screen.getByText('g GCE 1982')).toBeInTheDocument();
    expect(screen.getByText('MINE STORM')).toBeInTheDocument();
    expect(screen.getByText('$FD0D')).toBeInTheDocument();
    expect(screen.getByText('Power-On / Mine Storm')).toBeInTheDocument();
    expect(screen.getByText('-8 ($F8)')).toBeInTheDocument();
    expect(screen.getByText('80 ($50)')).toBeInTheDocument();
    expect(screen.getByText('32 ($20)')).toBeInTheDocument();
    expect(screen.getByText('-85 ($AB)')).toBeInTheDocument();
    expect(screen.getByLabelText('Hex dump preview')).toBeInTheDocument();
  });

  it('loads and displays a multi-line Vectrex ROM sample (Armor Attack)', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Armor Attack (Multi-Line)' }));

    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    expect(screen.getByText('ARMOR / ATTACK')).toBeInTheDocument();
    expect(screen.getByText('$FD81')).toBeInTheDocument();
    expect(screen.getByText('Armor Attack')).toBeInTheDocument();
    expect(screen.getByText(/Title Blocks \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Line 1: "ARMOR"/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2: "ATTACK"/)).toBeInTheDocument();
  });

  it('loads and displays a sample with a bad signature', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Bad Signature' }));

    expect(screen.getByText('✕ Invalid Header')).toBeInTheDocument();
    expect(
      screen.getByText('Bad Signature', { selector: '.vectrex-badge' })
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Missing signature/i);
  });

  it('loads and displays a sample with a missing terminator', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Missing Terminator' }));

    expect(screen.getByText('✕ Invalid Header')).toBeInTheDocument();
    expect(
      screen.getByText('Missing Terminator', { selector: '.vectrex-badge' })
    ).toBeInTheDocument();
  });

  it('loads and displays a truncated header sample', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Truncated Header' }));

    expect(screen.getByText('✕ Invalid Header')).toBeInTheDocument();
    expect(screen.getByText('Header Truncated')).toBeInTheDocument();
  });

  it('loads and displays an oversized ROM sample', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Oversized (64 KiB)' }));

    expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    expect(screen.getByText('> 32 KiB Limit')).toBeInTheDocument();
    expect(screen.getByText(/exceeds standard Vectrex cartridge limit/i)).toBeInTheDocument();
  });

  it('handles clearing results via Clear button', () => {
    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Mine Storm (Valid 8 KiB)' }));
    expect(screen.getByText('MINE STORM')).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn).not.toBeDisabled();

    fireEvent.click(clearBtn);

    expect(screen.queryByText('MINE STORM')).not.toBeInTheDocument();
    expect(clearBtn).toBeDisabled();
  });

  it('parses an uploaded ROM file via file input', async () => {
    const romBytes = utils.buildVectrexHeader({
      copyright: 'g GCE 1983',
      title: 'STAR TREK',
      totalRomSize: 8192,
    });
    vi.spyOn(utils, 'readRomHeaderPrefix').mockResolvedValue(romBytes);

    render(<VectrexRomHeaderInspectorTool />);

    const file = new File([romBytes], 'startrek.bin', { type: 'application/octet-stream' });
    const input = screen.getByLabelText('Upload Vectrex ROM file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('STAR TREK')).toBeInTheDocument();
      expect(screen.getByText('📁 startrek.bin')).toBeInTheDocument();
      expect(screen.getByText('✓ Valid Header')).toBeInTheDocument();
    });
  });

  it('supports drag and drop on the dropzone', async () => {
    const romBytes = utils.buildVectrexHeader({
      title: 'BEDLAM',
      totalRomSize: 8192,
    });
    vi.spyOn(utils, 'readRomHeaderPrefix').mockResolvedValue(romBytes);

    render(<VectrexRomHeaderInspectorTool />);

    const dropzone = screen.getByRole('button', {
      name: 'Drop ROM file here or click to browse',
    });

    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('dragging');

    fireEvent.dragLeave(dropzone);
    expect(dropzone).not.toHaveClass('dragging');

    const file = new File([romBytes], 'bedlam.vec', { type: 'application/octet-stream' });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText('BEDLAM')).toBeInTheDocument();
    });
  });

  it('copies JSON and hex dump with user feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<VectrexRomHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Mine Storm (Valid 8 KiB)' }));

    // Test Copy JSON
    const copyJsonBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyJsonBtn);
    });

    expect(writeText).toHaveBeenCalled();
    expect(screen.getByText('✓ Copied')).toBeInTheDocument();
    expect(screen.getByText('Copied JSON to clipboard')).toBeInTheDocument();

    // Test Copy Hex
    const copyHexBtn = screen.getByRole('button', { name: 'Copy Hex' });
    await act(async () => {
      fireEvent.click(copyHexBtn);
    });

    expect(screen.getByText('Copied Hex to clipboard')).toBeInTheDocument();
  });

  it('guards against stale asynchronous file reads', async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const file2Bytes = utils.buildVectrexHeader({ title: 'FAST GAME', totalRomSize: 8192 });

    vi.spyOn(utils, 'readRomHeaderPrefix').mockImplementation((file) => {
      if (file.name === 'slow.bin') {
        return firstPromise;
      }
      return Promise.resolve(file2Bytes);
    });

    render(<VectrexRomHeaderInspectorTool />);

    const file1 = new File([new Uint8Array(100)], 'slow.bin');
    const file2 = new File([file2Bytes], 'fast.bin');

    const input = screen.getByLabelText('Upload Vectrex ROM file');

    // Trigger slow file 1
    Object.defineProperty(input, 'files', { value: [file1], configurable: true });
    fireEvent.change(input);

    // Immediately trigger fast file 2
    Object.defineProperty(input, 'files', { value: [file2], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText('FAST GAME')).toBeInTheDocument();
    });

    // Now resolve the first slow read
    await act(async () => {
      resolveFirst(new Uint8Array(100));
    });

    // Stale result should not overwrite fast game
    expect(screen.getByText('FAST GAME')).toBeInTheDocument();
    expect(screen.queryByText('📁 slow.bin')).not.toBeInTheDocument();
  });
});
