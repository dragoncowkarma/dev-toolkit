import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AtariJaguarRomHeaderInspectorTool from './AtariJaguarRomHeaderInspectorTool.jsx';

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

function initValidHeader(bytes) {
  const marker = 'ATARI APPROVED DATA HEADER ATRI!';
  for (let i = 0; i < marker.length; i++) {
    bytes[i] = marker.charCodeAt(i);
  }
  // Boot address: 0x00802000
  bytes[32] = 0x00;
  bytes[33] = 0x80;
  bytes[34] = 0x20;
  bytes[35] = 0x00;
  // ROM size: 2,097,152 (2 MB)
  bytes[36] = 0x00;
  bytes[37] = 0x20;
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

  it('inspects and displays a valid Atari Jaguar ROM file', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('test_game.jag', 2097152, initValidHeader);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    expect(
      screen.getByText('ATARI APPROVED DATA HEADER ATRI!'),
    ).toBeInTheDocument();
    expect(screen.getByText('0x00802000')).toBeInTheDocument();
    expect(screen.getByText('2,097,152 bytes')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
    expect(screen.getByText('test_game.jag')).toBeInTheDocument();
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
  });

  it('displays unknown values when the header marker is missing', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('no_marker.rom', 1024);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    const unknownElements = screen.getAllByText('Unknown');
    expect(unknownElements.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports an error alert when the file is truncated', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('truncated.jag', 16);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
    expect(screen.queryByText('Header Marker')).not.toBeInTheDocument();
  });

  it('clears inspected results when Clear is clicked', async () => {
    render(<AtariJaguarRomHeaderInspectorTool />);

    const file = createRomFile('clear_test.jag', 2097152, initValidHeader);
    const input = screen.getByLabelText('Upload Atari Jaguar ROM');

    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('Header Marker')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.queryByText('Header Marker')).not.toBeInTheDocument();
    expect(input.value).toBe('');
  });
});
