import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HfsVolumeHeaderInspectorTool from './HfsVolumeHeaderInspectorTool.jsx';
import {
  bytesToHex,
  createSampleHfsHeader,
  HFS_PLUS_SIGNATURE,
  HFSX_SIGNATURE,
} from './hfs-volume-header-inspector.utils.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HfsVolumeHeaderInspectorTool component', () => {
  it('renders input area and toolbar buttons', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    expect(screen.getByRole('region', {
      name: 'HFS+ Volume Header Inspector',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hex Input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample HFS+' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample HFSX' })).toBeInTheDocument();
  });

  it('loads sample HFS+ volume header on button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFS+' }));

    expect(screen.getByText('Volume Header Details')).toBeInTheDocument();
    expect(screen.getByText(/HFS\+ \(H\+\)/)).toBeInTheDocument();
    expect(screen.getByText('4,096 B')).toBeInTheDocument();
    expect(screen.getByText('1.00 GB')).toBeInTheDocument();
  });

  it('loads sample HFSX volume header on button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFSX' }));

    expect(screen.getByText(/HFSX \(HX\)/)).toBeInTheDocument();
  });

  it('displays diagnostics on corrupt volume header sample', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Corrupt' }));

    expect(screen.getByText('Diagnostics & Integrity Checks')).toBeInTheDocument();
    expect(screen.getByText(/Bad signature/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid block size/)).toBeInTheDocument();
    expect(screen.getByText(/freeBlocks \(500000\) cannot exceed totalBlocks/)).toBeInTheDocument();
  });

  it('displays error on invalid hex input', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Paste HFS\+ \/ HFSX Volume Hex/);
    fireEvent.change(textarea, { target: { value: 'invalid_hex!' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Hex string contains invalid characters/);
  });

  it('switches between special file forks', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    const sample = createSampleHfsHeader({ signature: HFS_PLUS_SIGNATURE });
    const hex = bytesToHex(sample);

    const textarea = screen.getByLabelText(/Paste HFS\+ \/ HFSX Volume Hex/);
    fireEvent.change(textarea, { target: { value: hex } });

    expect(screen.getByText('Allocation File')).toBeInTheDocument();
    const catalogTab = screen.getByRole('tab', { name: 'Catalog File' });
    fireEvent.click(catalogTab);

    expect(catalogTab).toHaveClass('active');
    expect(screen.getByText('10.00 MB')).toBeInTheDocument();
  });

  it('clears input and output on Clear button click', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample HFS+' }));
    expect(screen.getByText('Volume Header Details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Volume Header Details')).not.toBeInTheDocument();
  });

  it('switches to file upload mode', () => {
    render(<HfsVolumeHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));
    expect(
      screen.getByText('Choose an HFS+ disk image or volume header file')
    ).toBeInTheDocument();
  });

  it('reads bounded slice at offset and re-reads when offset changes', async () => {
    render(<HfsVolumeHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

    const sample1024 = createSampleHfsHeader({ offset: 1024, signature: HFS_PLUS_SIGNATURE });
    const fullBuffer = new Uint8Array(10 * 1024 * 1024);
    fullBuffer.set(sample1024.subarray(1024, 1536), 1024);

    const file = new File([fullBuffer], 'disk.dmg', { type: 'application/octet-stream' });
    const sliceSpy = vi.spyOn(file, 'slice');

    const fileInput = document.querySelector('#hfs-file-input');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(sliceSpy).toHaveBeenCalledWith(1024, 1536);
    expect(await screen.findByText('Volume Header Details')).toBeInTheDocument();
    expect(screen.getByText(/HFS\+ \(H\+\)/)).toBeInTheDocument();

    // Change offset to 0
    const offsetSelect = screen.getByLabelText(/Header Offset:/);
    fireEvent.change(offsetSelect, { target: { value: '0' } });

    expect(sliceSpy).toHaveBeenCalledWith(0, 512);
  });

  it('displays truncated diagnostic when file is shorter than offset + 512', async () => {
    render(<HfsVolumeHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

    const shortFile = new File([new Uint8Array(500)], 'short.img');
    const fileInput = document.querySelector('#hfs-file-input');
    fireEvent.change(fileInput, { target: { files: [shortFile] } });

    expect(await screen.findByText('Diagnostics & Integrity Checks')).toBeInTheDocument();
    expect(screen.getByText(/Truncated input: expected at least 1536 bytes/)).toBeInTheDocument();
  });

  it('cancels and ignores in-flight file read when Clear is clicked', () => {
    let capturedReader = null;
    const OriginalFileReader = globalThis.FileReader;
    class ControllableFileReader extends EventTarget {
      constructor() {
        super();
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        capturedReader = this;
      }
      readAsArrayBuffer() {}
      abort() {
        if (this.onabort) this.onabort();
      }
    }
    globalThis.FileReader = ControllableFileReader;

    try {
      render(<HfsVolumeHeaderInspectorTool />);
      fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

      const file = new File([createSampleHfsHeader()], 'test.dmg');
      const fileInput = document.querySelector('#hfs-file-input');
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(capturedReader).not.toBeNull();

      // Click Clear before file read finishes
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      // Late completion from stale reader
      capturedReader.result = createSampleHfsHeader().slice(1024, 1536).buffer;
      act(() => {
        capturedReader.onload?.();
      });

      // Results must NOT repopulate
      expect(screen.queryByText('Volume Header Details')).not.toBeInTheDocument();
    } finally {
      globalThis.FileReader = OriginalFileReader;
    }
  });

  it('ignores out-of-order file reader completions when another file is selected', () => {
    const readers = [];
    const OriginalFileReader = globalThis.FileReader;
    class ControllableFileReader extends EventTarget {
      constructor() {
        super();
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        readers.push(this);
      }
      readAsArrayBuffer() {}
      abort() {
        if (this.onabort) this.onabort();
      }
    }
    globalThis.FileReader = ControllableFileReader;

    try {
      render(<HfsVolumeHeaderInspectorTool />);
      fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

      const file1 = new File(
        [createSampleHfsHeader({ signature: HFS_PLUS_SIGNATURE })],
        'slow.dmg'
      );
      const file2 = new File(
        [createSampleHfsHeader({ signature: HFSX_SIGNATURE, version: 5 })],
        'fast.dmg'
      );

      const fileInput = document.querySelector('#hfs-file-input');

      // Start file 1 read
      fireEvent.change(fileInput, { target: { files: [file1] } });
      const reader1 = readers[0];

      // Start file 2 read before file 1 finishes
      fireEvent.change(fileInput, { target: { files: [file2] } });
      const reader2 = readers[1];

      // File 2 finishes first
      reader2.result = createSampleHfsHeader({
        signature: HFSX_SIGNATURE,
        version: 5,
      }).slice(1024, 1536).buffer;
      act(() => {
        reader2.onload?.();
      });

      expect(screen.getByText('Volume Header Details')).toBeInTheDocument();
      expect(screen.getByText(/HFSX \(HX\)/)).toBeInTheDocument();

      // File 1 finishes late
      reader1.result = createSampleHfsHeader({
        signature: HFS_PLUS_SIGNATURE,
      }).slice(1024, 1536).buffer;
      act(() => {
        reader1.onload?.();
      });

      // UI must still show File 2 (HFSX), not overwritten by stale File 1
      expect(screen.getByText(/HFSX \(HX\)/)).toBeInTheDocument();
      expect(screen.queryByText(/HFS\+ \(H\+\)/)).not.toBeInTheDocument();
    } finally {
      globalThis.FileReader = OriginalFileReader;
    }
  });

  it('clears prior inspection results immediately when a new file is chosen', () => {
    let capturedReader = null;
    const OriginalFileReader = globalThis.FileReader;
    class ControllableFileReader extends EventTarget {
      constructor() {
        super();
        this.result = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        capturedReader = this;
      }
      readAsArrayBuffer() {}
      abort() {
        if (this.onabort) this.onabort();
      }
    }
    globalThis.FileReader = ControllableFileReader;

    try {
      render(<HfsVolumeHeaderInspectorTool />);
      fireEvent.click(screen.getByRole('button', { name: 'File Upload' }));

      const file1 = new File([createSampleHfsHeader()], 'file1.dmg');
      const fileInput = document.querySelector('#hfs-file-input');

      fireEvent.change(fileInput, { target: { files: [file1] } });
      capturedReader.result = createSampleHfsHeader().slice(1024, 1536).buffer;
      act(() => {
        capturedReader.onload?.();
      });

      expect(screen.getByText('Volume Header Details')).toBeInTheDocument();

      // Now choose file 2 (not yet completed)
      const file2 = new File([createSampleHfsHeader({ signature: HFSX_SIGNATURE })], 'file2.dmg');
      fireEvent.change(fileInput, { target: { files: [file2] } });

      // Prior result must be cleared immediately
      expect(screen.queryByText('Volume Header Details')).not.toBeInTheDocument();
    } finally {
      globalThis.FileReader = OriginalFileReader;
    }
  });

  it('displays volume creation date as local without asserting UTC in table', () => {
    render(<HfsVolumeHeaderInspectorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Sample HFS+' }));

    expect(screen.getByText('Formatted Date')).toBeInTheDocument();
    expect(screen.queryByText('Formatted Date (UTC)')).not.toBeInTheDocument();
    expect(screen.getByText(/Local \/ Unknown Zone/)).toBeInTheDocument();
  });
});
