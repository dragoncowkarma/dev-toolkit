import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AtariJaguarRomHeaderInspectorTool from './AtariJaguarRomHeaderInspectorTool.jsx';
import {
  CART_START_OFFSET,
  MARKER_TRACK_2,
} from './atari-jaguar-rom-header-inspector.utils.js';

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createRomFile(name, size, initFn) {
  const bytes = new Uint8Array(size);
  if (initFn) {
    initFn(bytes);
  }
  return new File([bytes], name, { type: 'application/octet-stream' });
}

function initValidCartridge(bytes) {
  // Start address at ROM offset 0x404: 0x00802000
  bytes[CART_START_OFFSET] = 0x00;
  bytes[CART_START_OFFSET + 1] = 0x80;
  bytes[CART_START_OFFSET + 2] = 0x20;
  bytes[CART_START_OFFSET + 3] = 0x00;
}

function initValidCdHeader(bytes) {
  for (let i = 0; i < MARKER_TRACK_2.length; i++) {
    bytes[i] = MARKER_TRACK_2.charCodeAt(i);
  }
  // Boot address: 0x00802000
  bytes[32] = 0x00;
  bytes[33] = 0x80;
  bytes[34] = 0x20;
  bytes[35] = 0x00;
  // CD boot-code length: 65,536 bytes
  bytes[36] = 0x00;
  bytes[37] = 0x01;
  bytes[38] = 0x00;
  bytes[39] = 0x00;
}

afterEach(() => {
  cleanup();
});

describe('AtariJaguarRomHeaderInspectorTool', () => {
  it('renders upload instructions and file input initially', () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    expect(
      screen.getByLabelText('Upload Atari Jaguar ROM'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Upload a \.jag, \.j64, or \.rom cartridge image/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('term', { name: /Header Marker/i }),
    ).not.toBeInTheDocument();
  });

  it('inspects and displays a valid Atari Jaguar cartridge file (.j64)', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('alien_vs_predator.j64', 4194304, initValidCartridge);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(screen.getByText('0x00802000')).toBeInTheDocument();
    expect(screen.getByText('4 MB')).toBeInTheDocument();
    expect(screen.getByText('alien_vs_predator.j64')).toBeInTheDocument();
    expect(screen.getByText('4.0 MB')).toBeInTheDocument();
  });

  it('inspects and displays a Jaguar CD header image', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('jag_cd_track.bin', 2097152, initValidCdHeader);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(
      screen.getByText('ATARI APPROVED DATA HEADER ATRI!'),
    ).toBeInTheDocument();
    expect(screen.getByText('0x00802000')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });

  it('reports an error alert when the file is truncated and offers Clear', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('truncated.jag', 16);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
    expect(screen.queryByText('Header Marker')).not.toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: 'Clear' });
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('allows retrying file selection after an error without getting stuck', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    // First upload: bad truncated file
    const badFile = createRomFile('bad.jag', 20);
    await act(async () => selectFile(input, badFile));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Clicking the input resets its value to allow re-selection
    fireEvent.click(input);
    expect(input.value).toBe('');

    // Second upload: corrected valid file
    const goodFile = createRomFile('bad.jag', 2097152, initValidCartridge);
    await act(async () => selectFile(input, goodFile));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('0x00802000')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });

  it('clears inspected results when Clear is clicked', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('clear_test.j64', 2097152, initValidCartridge);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText('Header Marker')).not.toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('inspects irregular file size without stack overflow and shows Unknown address', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    // 2049-byte file with zeroed header
    const file = createRomFile('irregular_zeroed.rom', 2049);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThanOrEqual(1);
  });

  it('displays Unknown for boot address when cartridge address is invalid', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('invalid_addr.j64', 2097152, (bytes) => {
      bytes[CART_START_OFFSET + 3] = 0x01;
    });
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(screen.queryByText('0x00000001')).not.toBeInTheDocument();
  });
});
