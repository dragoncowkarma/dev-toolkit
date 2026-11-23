import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CramfsSuperblockInspectorTool from './CramfsSuperblockInspectorTool.jsx';
import { createSampleSuperblock } from './cramfs.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
});

describe('CramfsSuperblockInspectorTool', () => {
  it('renders initial empty state with file selection and sample buttons', () => {
    render(<CramfsSuperblockInspectorTool />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'CramFS Superblock Inspector' })
    ).toBeInTheDocument();
    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load LE Sample' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load BE Sample' })).toBeInTheDocument();
  });

  it('loads and displays a Little-Endian sample on button click', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    expect(screen.getByText('0x28cd3d45')).toBeInTheDocument();
    expect(screen.getByText('"Compressed ROMFS"')).toBeInTheDocument();
    expect(screen.getByText('"sample_le.cramfs"')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads and displays a Big-Endian sample on button click', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load BE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Big-Endian (BE)')).toBeInTheDocument();
    });

    expect(screen.getByText('0x28cd3d45')).toBeInTheDocument();
    expect(screen.getByText('"sample_be.cramfs"')).toBeInTheDocument();
  });

  it('inspects an uploaded Little-Endian CramFS image file', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const sample = createSampleSuperblock({
      endianness: 'little',
      size: 65536,
      name: 'my_filesystem',
    });
    // Create image larger than 76 bytes to ensure only 76 bytes are read
    const fullImage = new Uint8Array(100000);
    fullImage.set(sample, 0);

    const file = new File([fullImage], 'test_le.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    expect(screen.getByText('"my_filesystem"')).toBeInTheDocument();
    expect(screen.getAllByText(/100,000 bytes/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows truncated error alert and resets state when uploaded file is < 76 bytes', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const file = new File([new Uint8Array(30)], 'short.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        /Truncated CramFS image: expected at least 76 bytes, received 30 byte\(s\)/i
      );
    });

    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
    expect(screen.queryByText('Big-Endian (BE)')).not.toBeInTheDocument();
  });

  it('shows bad magic error alert and resets state on corrupted file', async () => {
    render(<CramfsSuperblockInspectorTool />);

    const badData = new Uint8Array(80);
    badData[0] = 0xde;
    badData[1] = 0xad;
    badData[2] = 0xbe;
    badData[3] = 0xef;

    const file = new File([badData], 'corrupt.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/Invalid CramFS magic: expected 0x28cd3d45/i);
    });

    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when user clicks Clear button', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));

    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when a new file selection fails after a valid file was displayed', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    // Now select a truncated file
    const file = new File([new Uint8Array(10)], 'broken.cramfs');
    const input = screen.getByLabelText('Upload CramFS image');

    await act(async () => {
      selectFile(input, file);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Previous valid data should be gone
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });

  it('resets state when file input event fires with no files (e.g. cancelled dialog)', async () => {
    render(<CramfsSuperblockInspectorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load LE Sample' }));
    await waitFor(() => {
      expect(screen.getByText('Little-Endian (LE)')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Upload CramFS image');
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    fireEvent.change(input);

    expect(screen.getByText('No CramFS image loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Little-Endian (LE)')).not.toBeInTheDocument();
  });
});
