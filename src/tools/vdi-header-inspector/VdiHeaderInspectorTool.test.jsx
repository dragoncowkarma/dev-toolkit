import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VdiHeaderInspectorTool from './VdiHeaderInspectorTool.jsx';
import { createSampleVdiHeader } from './vdi.utils.js';

afterEach(() => {
  cleanup();
});

describe('VdiHeaderInspectorTool component', () => {
  it('renders correctly with initial landmarks and empty state', () => {
    render(<VdiHeaderInspectorTool />);

    expect(screen.getByRole('region', { name: 'VDI Header Inspector' })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload VDI file')).toBeInTheDocument();
    expect(screen.getByLabelText(/Or Paste Hex Bytes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample Dynamic VDI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sample Fixed VDI' })).toBeInTheDocument();
  });

  it('loads dynamic sample on button click and renders decoded summary', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Dynamic VDI' }));

    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();
    expect(screen.getByText('0xBEDA107F')).toBeInTheDocument();
    expect(screen.getByText('dynamic', { selector: '.field-badge' })).toBeInTheDocument();
    expect(screen.getByText('Raw Header Hex Dump')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads fixed sample on button click and renders fixed badge', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Fixed VDI' }));

    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();
    expect(screen.getByText('fixed', { selector: '.field-badge' })).toBeInTheDocument();
  });

  it('renders accessible error when invalid hex is provided', () => {
    render(<VdiHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Or Paste Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: 'not-valid-hex' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid character/i);
  });

  it('renders accessible error when truncated hex is provided', () => {
    render(<VdiHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Or Paste Hex Bytes/i);
    // 4 bytes: 7F 10 DA BE
    fireEvent.change(textarea, { target: { value: '7F 10 DA BE' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/truncated/i);
  });

  it('clears input and parsed results when Clear is clicked', () => {
    render(<VdiHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Dynamic VDI' }));
    expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    expect(clearBtn).not.toBeDisabled();
    fireEvent.click(clearBtn);

    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('handles file drop', () => {
    render(<VdiHeaderInspectorTool />);

    const sample = createSampleVdiHeader({ imageType: 1 });
    const file = new File([sample], 'test.vdi', { type: 'application/octet-stream' });

    const dropzone = screen.getByRole('region', { name: 'VDI file drop zone' });
    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass('dragging');

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });
    expect(dropzone).not.toHaveClass('dragging');
  });

  it('reads bounded first 512 bytes on large file upload without reading entire file', async () => {
    render(<VdiHeaderInspectorTool />);

    const sampleHeader = createSampleVdiHeader({ imageType: 1, description: '10GB Disk Image' });
    const sampleBytes = new Uint8Array(sampleHeader);
    const mockFile = new File(
      [sampleBytes],
      'large-10gb.vdi',
      { type: 'application/octet-stream' },
    );
    Object.defineProperty(mockFile, 'size', { value: 10 * 1024 * 1024 * 1024 });

    const sliceSpy = vi.spyOn(mockFile, 'slice');

    const input = screen.getByLabelText('Upload VDI file');
    fireEvent.change(input, { target: { files: [mockFile] } });

    expect(sliceSpy).toHaveBeenCalledWith(0, 512);

    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Decoded VDI Header' })).toBeInTheDocument();
    });
    expect(screen.getByText('Loaded: large-10gb.vdi')).toBeInTheDocument();
    expect(screen.getByText('10GB Disk Image')).toBeInTheDocument();
  });

  it('discards stale file reads when a newer file read completes out of order', () => {
    const originalFileReader = window.FileReader;
    const readers = [];

    class ControllableFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.result = null;
        readers.push(this);
      }
      readAsArrayBuffer(blob) {
        this.blob = blob;
      }
      abort() {
        if (this.onabort) this.onabort();
      }
    }

    try {
      window.FileReader = ControllableFileReader;
      render(<VdiHeaderInspectorTool />);

      const file1 = new File([createSampleVdiHeader({ description: 'File 1 Old' })], 'file1.vdi');
      const file2 = new File([createSampleVdiHeader({ description: 'File 2 New' })], 'file2.vdi');

      const input = screen.getByLabelText('Upload VDI file');

      // Upload file 1
      fireEvent.change(input, { target: { files: [file1] } });
      expect(readers).toHaveLength(1);

      // Upload file 2 before file 1 finishes
      fireEvent.change(input, { target: { files: [file2] } });
      expect(readers).toHaveLength(2);

      // File 2 completes first
      readers[1].result = createSampleVdiHeader({ description: 'File 2 New' });
      act(() => {
        readers[1].onload({ target: { result: readers[1].result } });
      });

      expect(screen.getByText('Loaded: file2.vdi')).toBeInTheDocument();
      expect(screen.getByText('File 2 New')).toBeInTheDocument();

      // File 1 completes late (out of order)
      readers[0].result = createSampleVdiHeader({ description: 'File 1 Old' });
      act(() => {
        readers[0].onload({ target: { result: readers[0].result } });
      });

      // Still displays File 2, NOT File 1!
      expect(screen.getByText('Loaded: file2.vdi')).toBeInTheDocument();
      expect(screen.getByText('File 2 New')).toBeInTheDocument();
      expect(screen.queryByText('File 1 Old')).not.toBeInTheDocument();
    } finally {
      window.FileReader = originalFileReader;
    }
  });

  it('discards pending file read when Clear is clicked before read completes', () => {
    const originalFileReader = window.FileReader;
    const readers = [];

    class ControllableFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.result = null;
        readers.push(this);
      }
      readAsArrayBuffer(blob) {
        this.blob = blob;
      }
      abort() {
        if (this.onabort) this.onabort();
      }
    }

    try {
      window.FileReader = ControllableFileReader;
      render(<VdiHeaderInspectorTool />);

      const file = new File(
        [createSampleVdiHeader({ description: 'Pending File' })],
        'pending.vdi',
      );
      const input = screen.getByLabelText('Upload VDI file');

      fireEvent.change(input, { target: { files: [file] } });
      expect(readers).toHaveLength(1);

      // Click Clear before read completes
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

      // Late completion of file read
      readers[0].result = createSampleVdiHeader({ description: 'Pending File' });
      act(() => {
        readers[0].onload({ target: { result: readers[0].result } });
      });

      // State remains cleared
      expect(screen.queryByRole('main')).not.toBeInTheDocument();
      expect(screen.queryByText('Pending File')).not.toBeInTheDocument();
      expect(screen.queryByText(/Loaded: pending\.vdi/)).not.toBeInTheDocument();
    } finally {
      window.FileReader = originalFileReader;
    }
  });

  it('discards pending file read when sample is loaded or hex is typed', () => {
    const originalFileReader = window.FileReader;
    const readers = [];

    class ControllableFileReader {
      constructor() {
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.result = null;
        readers.push(this);
      }
      readAsArrayBuffer(blob) {
        this.blob = blob;
      }
      abort() {
        if (this.onabort) this.onabort();
      }
    }

    try {
      window.FileReader = ControllableFileReader;
      render(<VdiHeaderInspectorTool />);

      const file = new File(
        [createSampleVdiHeader({ description: 'File Before Sample' })],
        'sample-overwrite.vdi',
      );
      const input = screen.getByLabelText('Upload VDI file');

      fireEvent.change(input, { target: { files: [file] } });
      expect(readers).toHaveLength(1);

      // User loads sample
      fireEvent.click(screen.getByRole('button', { name: 'Sample Dynamic VDI' }));
      expect(screen.getByText('Loaded: sample-dynamic.vdi')).toBeInTheDocument();

      // Late file onload fires
      readers[0].result = createSampleVdiHeader({ description: 'File Before Sample' });
      act(() => {
        readers[0].onload({ target: { result: readers[0].result } });
      });

      // Sample remains active, file is discarded
      expect(screen.getByText('Loaded: sample-dynamic.vdi')).toBeInTheDocument();
      expect(screen.queryByText('File Before Sample')).not.toBeInTheDocument();
    } finally {
      window.FileReader = originalFileReader;
    }
  });

  it('renders badges for undo and differencing image types', () => {
    render(<VdiHeaderInspectorTool />);

    // Test undo type (3)
    const undoBuffer = createSampleVdiHeader({ imageType: 3 });
    const undoBytes = Array.from(new Uint8Array(undoBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    const textarea = screen.getByLabelText(/Or Paste Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: undoBytes } });

    expect(screen.getByText('undo', { selector: '.badge-undo' })).toBeInTheDocument();

    // Test differencing type (4)
    const diffBuffer = createSampleVdiHeader({ imageType: 4 });
    const diffBytes = Array.from(new Uint8Array(diffBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    fireEvent.change(textarea, { target: { value: diffBytes } });
    expect(
      screen.getByText('differencing', { selector: '.badge-differencing' }),
    ).toBeInTheDocument();
  });
});
