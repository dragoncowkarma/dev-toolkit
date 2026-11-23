import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ZlibHeaderInspectorTool from './ZlibHeaderInspectorTool.jsx';

afterEach(() => {
  cleanup();
});

describe('ZlibHeaderInspectorTool component', () => {
  it('renders initial default header (78 9C) inspection results', () => {
    render(<ZlibHeaderInspectorTool />);

    expect(screen.getByRole('heading', { name: /Zlib Header Inspector/i })).toBeInTheDocument();
    expect(screen.getByText('deflate')).toBeInTheDocument();
    expect(screen.getByText(/32,768 B \(32 KB\)/)).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText(/Valid \(✓\)/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('updates inspection when user selects a sample button', () => {
    render(<ZlibHeaderInspectorTool />);

    const maxCompBtn = screen.getByRole('button', { name: /Maximum Compression/i });
    fireEvent.click(maxCompBtn);

    expect(screen.getByText('maximum')).toBeInTheDocument();
    expect(screen.getByText('deflate')).toBeInTheDocument();
  });

  it('displays alert on bad FCHECK', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78 9D' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Invalid FCHECK/i);
  });

  it('displays alert on invalid hex characters', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78 ZZ' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/invalid hexadecimal/i);
  });

  it('displays alert on truncated buffer', () => {
    render(<ZlibHeaderInspectorTool />);

    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    fireEvent.change(textarea, { target: { value: '78' } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Truncated buffer/i);
  });

  it('renders hex dump with copy button for parsed stream', () => {
    render(<ZlibHeaderInspectorTool />);

    expect(screen.getByRole('region', { name: /Raw Hex Dump View/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Hex Dump/i })).toBeInTheDocument();
  });

  it('preserves full file and trailer when uploading stream > 64 bytes', async () => {
    render(<ZlibHeaderInspectorTool />);

    const totalBytes = 72;
    const stream = new Uint8Array(totalBytes);
    // RFC 1950 valid deflate header: 78 9C
    stream[0] = 0x78;
    stream[1] = 0x9c;
    // Fill middle bytes; preview bytes 60..63 are 0xAA
    for (let i = 2; i < 68; i += 1) {
      stream[i] = 0xaa;
    }
    // Actual trailer (Adler-32): 0xDE 0xAD 0xBE 0xEF
    stream[68] = 0xde;
    stream[69] = 0xad;
    stream[70] = 0xbe;
    stream[71] = 0xef;

    const file = new File([stream], 'large-stream.zlib', {
      type: 'application/octet-stream',
    });

    const fileInput = screen.getByLabelText(/Upload zlib file/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Verify Adler-32 is actual trailing checksum (0xDEADBEEF), not preview bytes 60..63
    expect(await screen.findByText('0xDEADBEEF')).toBeInTheDocument();
    expect(screen.queryByText('0xAAAAAAAA')).not.toBeInTheDocument();

    // Verify loaded file is displayed
    expect(screen.getByText(/Loaded file: large-stream\.zlib/i)).toBeInTheDocument();

    // Verify raw dump header shows all 72 bytes
    expect(screen.getByText('Raw Hex Dump (72 bytes)')).toBeInTheDocument();

    // Verify the textarea has the 64-byte preview
    const textarea = screen.getByLabelText(/Zlib Stream Hex Bytes/i);
    const textareaTokens = textarea.value.trim().split(/\s+/);
    expect(textareaTokens).toHaveLength(64);

    // Verify that subsequent edit of textarea switches back to hex input mode
    fireEvent.change(textarea, { target: { value: '78 DA' } });
    expect(screen.getByText('maximum')).toBeInTheDocument();
    expect(screen.queryByText(/Loaded file: large-stream\.zlib/i)).not.toBeInTheDocument();
  });

  it('preserves full file and trailer when dropping stream > 64 bytes', async () => {
    render(<ZlibHeaderInspectorTool />);

    const totalBytes = 70;
    const stream = new Uint8Array(totalBytes);
    stream[0] = 0x78;
    stream[1] = 0x01;
    for (let i = 2; i < 66; i += 1) {
      stream[i] = 0xbb;
    }
    // Trailer: 0xCAFEFEED
    stream[66] = 0xca;
    stream[67] = 0xfe;
    stream[68] = 0xfe;
    stream[69] = 0xed;

    const file = new File([stream], 'dropped.zlib');
    const dropzone = screen.getByRole('region', { name: /File upload dropzone/i });

    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByText('0xCAFEFEED')).toBeInTheDocument();
    expect(screen.getByText('Raw Hex Dump (70 bytes)')).toBeInTheDocument();
    expect(screen.getByText(/Loaded file: dropped\.zlib/i)).toBeInTheDocument();
  });

  it('displays error alert on file read failure', async () => {
    const originalFileReader = global.FileReader;
    class FailingFileReader {
      readAsArrayBuffer() {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror();
          }
        }, 0);
      }
    }
    global.FileReader = FailingFileReader;

    try {
      render(<ZlibHeaderInspectorTool />);
      const file = new File([new Uint8Array([0x78, 0x9c])], 'fail.zlib');
      const fileInput = screen.getByLabelText(/Upload zlib file/i);
      fireEvent.change(fileInput, { target: { files: [file] } });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/Failed to read the selected file/i);
    } finally {
      global.FileReader = originalFileReader;
    }
  });

  it('preserves read failure when second file read fails after upload', async () => {
    const totalBytes = 72;
    const stream = new Uint8Array(totalBytes);
    stream[0] = 0x78;
    stream[1] = 0x9c;
    for (let i = 2; i < 68; i += 1) {
      stream[i] = 0xaa;
    }
    stream[68] = 0xde;
    stream[69] = 0xad;
    stream[70] = 0xbe;
    stream[71] = 0xef;

    const file1 = new File([stream], 'first-large.zlib', {
      type: 'application/octet-stream',
    });

    render(<ZlibHeaderInspectorTool />);
    const fileInput = screen.getByLabelText(/Upload zlib file/i);

    fireEvent.change(fileInput, { target: { files: [file1] } });

    // Confirm initial upload succeeded with full Adler-32 checksum and file name
    expect(await screen.findByText('0xDEADBEEF')).toBeInTheDocument();
    expect(screen.getByText(/Loaded file: first-large\.zlib/i)).toBeInTheDocument();
    expect(screen.getByText('Raw Hex Dump (72 bytes)')).toBeInTheDocument();

    // Now fail the next file read
    const originalFileReader = global.FileReader;
    class FailingFileReader {
      readAsArrayBuffer() {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror();
          }
        }, 0);
      }
    }
    global.FileReader = FailingFileReader;

    try {
      const file2 = new File([new Uint8Array([0x78, 0x01])], 'second-fail.zlib');
      fireEvent.change(fileInput, { target: { files: [file2] } });

      // Error alert must remain visible
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/Failed to read the selected file/i);

      // Verify no stale preview or previous results are presented as the new file's result
      expect(screen.queryByText(/Loaded file/i)).not.toBeInTheDocument();
      expect(screen.queryByText('0xDEADBEEF')).not.toBeInTheDocument();
      expect(screen.queryByText('0xAAAAAAAA')).not.toBeInTheDocument();
      expect(screen.queryByRole('article', {
        name: /Header Summary/i,
      })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', {
        name: /Raw Hex Dump View/i,
      })).not.toBeInTheDocument();
    } finally {
      global.FileReader = originalFileReader;
    }
  });
});
