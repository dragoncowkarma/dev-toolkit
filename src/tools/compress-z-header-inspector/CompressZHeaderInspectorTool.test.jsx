import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompressZHeaderInspectorTool from './CompressZHeaderInspectorTool.jsx';
import * as utils from './compress-z-header-inspector.utils.js';

vi.mock('./compress-z-header-inspector.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFileHeaderBytes: vi.fn(actual.readFileHeaderBytes) };
});

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

describe('CompressZHeaderInspectorTool UI rendering and inspection', () => {
  it('renders tool with empty placeholder state initially', () => {
    render(<CompressZHeaderInspectorTool />);

    expect(screen.getByRole('button', { name: 'Hex' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Base64' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByText(/Enter hex or base64 stream data, or upload a \.Z file/i)
    ).toBeInTheDocument();
  });

  it('inspects valid hex input and renders decoded header fields', async () => {
    render(<CompressZHeaderInspectorTool />);

    const textarea = screen.getByLabelText('Hex Input');
    fireEvent.change(textarea, { target: { value: '1F 9D 90' } });

    await waitFor(() => {
      expect(screen.getByText('16 bits')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('65,536')).toBeInTheDocument();
    expect(screen.getByText('0 (0b00)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders error state when invalid magic bytes are entered', async () => {
    render(<CompressZHeaderInspectorTool />);

    const textarea = screen.getByLabelText('Hex Input');
    fireEvent.change(textarea, { target: { value: '1F 8B 08' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid magic bytes');
    expect(screen.getByText(/Enter hex or base64 stream data/i)).toBeInTheDocument();
  });

  it('renders error state for truncated input', async () => {
    render(<CompressZHeaderInspectorTool />);

    const textarea = screen.getByLabelText('Hex Input');
    fireEvent.change(textarea, { target: { value: '1F 9D' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Truncated input');
  });

  it('renders error state for reserved bits set', async () => {
    render(<CompressZHeaderInspectorTool />);

    const textarea = screen.getByLabelText('Hex Input');
    // 0xB0 has bit 5 set
    fireEvent.change(textarea, { target: { value: '1F 9D B0' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('reserved bits must be zero');
  });

  it('switches between Hex and Base64 modes and loads samples', async () => {
    render(<CompressZHeaderInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Hex Input')).toHaveValue('1F 9D 90');
      expect(screen.getByText('16 bits')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Base64' }));
    expect(screen.getByLabelText('Base64 Input')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Base64 Input')).toHaveValue('H52Q');
      expect(screen.getByText('16 bits')).toBeInTheDocument();
    });
  });

  it('clears all inputs, inspection results, and errors on Clear click', async () => {
    render(<CompressZHeaderInspectorTool />);

    fireEvent.change(screen.getByLabelText('Hex Input'), { target: { value: '1F 9D' } });
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Hex Input')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Enter hex or base64 stream data/i)).toBeInTheDocument();
  });
});

describe('CompressZHeaderInspectorTool file upload and copy', () => {
  it('inspects an uploaded .Z file', async () => {
    const fileBytes = new Uint8Array([0x1f, 0x9d, 0x8c]); // 12-bit block mode
    const file = new File([fileBytes], 'test.Z', { type: 'application/x-compress' });

    render(<CompressZHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload .Z file');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Selected File')).toHaveValue('📁 test.Z (3 B)');
      expect(screen.getByText('12 bits')).toBeInTheDocument();
      expect(screen.getByText('4,096')).toBeInTheDocument();
    });
  });

  it('handles stale file reads when clearing while read is pending', async () => {
    const deferred = createDeferred();
    utils.readFileHeaderBytes.mockReturnValueOnce(deferred.promise);

    render(<CompressZHeaderInspectorTool />);

    const file = new File([new Uint8Array([0x1f, 0x9d, 0x90])], 'stale.Z');
    const fileInput = screen.getByLabelText('Upload .Z file');
    selectFile(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await act(async () => {
      deferred.resolve(new Uint8Array([0x1f, 0x9d, 0x90]));
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Hex Input')).toHaveValue('');
    expect(screen.queryByText('16 bits')).not.toBeInTheDocument();
  });

  it('copies inspected JSON to clipboard and announces copied status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CompressZHeaderInspectorTool />);

    fireEvent.change(screen.getByLabelText('Hex Input'), { target: { value: '1F 9D 90' } });
    await waitFor(() => expect(screen.getByText('16 bits')).toBeInTheDocument());

    const copyBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('displays copy error if clipboard write fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<CompressZHeaderInspectorTool />);

    fireEvent.change(screen.getByLabelText('Hex Input'), { target: { value: '1F 9D 90' } });
    await waitFor(() => expect(screen.getByText('16 bits')).toBeInTheDocument());

    const copyBtn = screen.getByRole('button', { name: 'Copy JSON' });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to copy to clipboard.');
  });

  it('reports actual stream size for files larger than MAX_INPUT_BYTES', async () => {
    const largeSize = 100 * 1024; // 100 KiB
    const largeBuffer = new Uint8Array(largeSize);
    largeBuffer[0] = 0x1f;
    largeBuffer[1] = 0x9d;
    largeBuffer[2] = 0x90; // 16 bits, block mode
    const file = new File([largeBuffer], 'large.Z', { type: 'application/x-compress' });

    render(<CompressZHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload .Z file');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Selected File')).toHaveValue('📁 large.Z (100.0 KB)');
      expect(screen.getByText('102,400 B')).toBeInTheDocument();
      expect(screen.getByText('102,397 B')).toBeInTheDocument();
    });
  });

  it('resets file selection state on failed upload and allows recovery', async () => {
    const validBytes = new Uint8Array([0x1f, 0x9d, 0x90]);
    const validFile = new File([validBytes], 'valid.Z', { type: 'application/x-compress' });

    const invalidBytes = new Uint8Array([0x1f, 0x8b, 0x08]); // Gzip magic
    const invalidFile = new File([invalidBytes], 'invalid.Z', { type: 'application/x-compress' });

    render(<CompressZHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload .Z file');

    // Step 1: Upload valid file
    await act(async () => selectFile(fileInput, validFile));
    await waitFor(() => {
      expect(screen.getByLabelText('Selected File')).toHaveValue('📁 valid.Z (3 B)');
      expect(screen.getByText('16 bits')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Selected File')).toHaveAttribute('readonly');

    // Step 2: Upload invalid file -> should reset file state and clear readOnly
    await act(async () => selectFile(fileInput, invalidFile));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid magic bytes');
    });

    const textarea = screen.getByLabelText('Hex Input');
    expect(textarea).not.toHaveAttribute('readonly');
    expect(textarea).toHaveValue('');
    expect(screen.queryByText('16 bits')).not.toBeInTheDocument();

    // Step 3: Recovery via typing hex text
    fireEvent.change(textarea, { target: { value: '1F 9D 8C' } });
    await waitFor(() => {
      expect(screen.getByText('12 bits')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Step 4: Upload an invalid file that fails reading
    utils.readFileHeaderBytes.mockRejectedValueOnce(new Error('Failed to read file.'));
    await act(async () => selectFile(fileInput, invalidFile));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to read file.');
    });
    expect(screen.getByLabelText('Hex Input')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Hex Input')).toHaveValue('');

    // Step 5: Recovery via Load Sample
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    await waitFor(() => {
      expect(screen.getByText('16 bits')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('resets native file input so selecting the same file triggers change', async () => {
    const fileBytes = new Uint8Array([0x1f, 0x9d, 0x90]);
    const file = new File([fileBytes], 'test.Z', { type: 'application/x-compress' });

    render(<CompressZHeaderInspectorTool />);

    const fileInput = screen.getByLabelText('Upload .Z file');
    await act(async () => selectFile(fileInput, file));

    await waitFor(() => {
      expect(screen.getByLabelText('Selected File')).toHaveValue('📁 test.Z (3 B)');
    });

    // Native file input value is cleared
    expect(fileInput.value).toBe('');

    // Selecting the same file again works
    await act(async () => selectFile(fileInput, file));
    await waitFor(() => {
      expect(screen.getByLabelText('Selected File')).toHaveValue('📁 test.Z (3 B)');
      expect(screen.getByText('16 bits')).toBeInTheDocument();
    });

    // Switching to sample clears file input
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(fileInput.value).toBe('');
    expect(screen.getByLabelText('Hex Input')).toHaveValue('1F 9D 90');
  });
});
