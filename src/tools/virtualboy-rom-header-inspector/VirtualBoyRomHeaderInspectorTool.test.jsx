import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VirtualBoyRomHeaderInspectorTool from './VirtualBoyRomHeaderInspectorTool.jsx';
import * as utils from './virtualboyRomHeader.utils.js';

vi.mock('./virtualboyRomHeader.utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFileAsBytes: vi.fn(actual.readFileAsBytes) };
});

function selectFile(input, file) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function createValidRomBytes({
  size = utils.MIN_ROM_SIZE,
  title = 'WARIO LAND',
  maker = '01',
  gameCode = 'VWLE',
  version = 0x00,
} = {}) {
  const rom = new Uint8Array(size);
  const headerOffset = size - utils.HEADER_OFFSET_FROM_END;
  rom.fill(0x20, headerOffset, headerOffset + 20);
  const titleBytes = typeof title === 'string'
    ? Array.from(title, (ch) => ch.charCodeAt(0))
    : title;
  rom.set(titleBytes.slice(0, 20), headerOffset);
  rom.set(Array.from(maker, (ch) => ch.charCodeAt(0)), headerOffset + 0x19);
  rom.set(Array.from(gameCode, (ch) => ch.charCodeAt(0)), headerOffset + 0x1b);
  rom[headerOffset + 0x1f] = version;
  // Populate Reset vector at size - 0x10
  rom.set([0x28, 0x00, 0x00, 0x01], size - 0x10);
  return rom;
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
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('VirtualBoyRomHeaderInspectorTool', () => {
  it('renders empty state with privacy notice and disabled Clear button', () => {
    render(<VirtualBoyRomHeaderInspectorTool />);

    expect(screen.getByText('No ROM loaded')).toBeInTheDocument();
    expect(screen.getByText(/no ROM data leaves your device/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('displays decoded ROM fields in div-wrapped dl pairs on valid upload', async () => {
    const { container } = render(<VirtualBoyRomHeaderInspectorTool />);
    const romBytes = createValidRomBytes();
    const file = new File([romBytes], 'wario.vb');

    const input = screen.getByLabelText('Upload Virtual Boy ROM file');
    await act(async () => selectFile(input, file));

    await waitFor(() => {
      expect(screen.getByText('WARIO LAND')).toBeInTheDocument();
    });

    expect(screen.getByText('01 — Nintendo')).toBeInTheDocument();
    expect(screen.getByText('VWLE')).toBeInTheDocument();
    expect(screen.getByText('E (North America)')).toBeInTheDocument();
    expect(screen.getByText('1.0 (0x00)')).toBeInTheDocument();
    expect(screen.getByText(/Present \(1\/32 slots\)/)).toBeInTheDocument();

    const dls = container.querySelectorAll('dl');
    expect(dls.length).toBeGreaterThan(0);
    dls.forEach((dl) => {
      const children = Array.from(dl.children);
      expect(children.length).toBeGreaterThan(0);
      children.forEach((child) => {
        expect(child.tagName).toBe('DIV');
        expect(child.querySelector('dt')).not.toBeNull();
        expect(child.querySelector('dd')).not.toBeNull();
      });
    });
  });

  it('shows an error alert for truncated and non power-of-two files', async () => {
    render(<VirtualBoyRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Upload Virtual Boy ROM file');

    await act(async () => {
      selectFile(input, new File([new Uint8Array(256)], 'tiny.vb'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/too small/i);
    expect(input.value).toBe('');

    await act(async () => {
      selectFile(input, new File([new Uint8Array(20000)], 'odd.vb'));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/power of two/i);
    });
    expect(input.value).toBe('');
  });

  it('renders Shift-JIS titles and shows Unknown for invalid non-ASCII bytes', async () => {
    render(<VirtualBoyRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Upload Virtual Boy ROM file');

    const sjisRom = createValidRomBytes({
      title: [0x83, 0x7d, 0x83, 0x8a, 0x83, 0x49],
      gameCode: 'VMCJ',
    });
    await act(async () => selectFile(input, new File([sjisRom], 'mario_jp.vb')));
    await waitFor(() => expect(screen.getByText('マリオ')).toBeInTheDocument());
    expect(screen.getByText('Encoding: Shift-JIS')).toBeInTheDocument();

    const invalidRom = createValidRomBytes({ title: [0xff, 0xfe, 0x80] });
    await act(async () => selectFile(input, new File([invalidRom], 'corrupt.vb')));
    await waitFor(() => expect(screen.getByText('Encoding: Unknown')).toBeInTheDocument());
  });

  it('rejects oversized files before reading them into memory', async () => {
    render(<VirtualBoyRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Upload Virtual Boy ROM file');
    const oversizedFile = new File([], 'huge.vb');
    Object.defineProperty(oversizedFile, 'size', { value: 2 * 1024 * 1024 * 1024 });

    await act(async () => {
      selectFile(input, oversizedFile);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/too large/i);
    expect(utils.readFileAsBytes).not.toHaveBeenCalled();
  });

  it('clears results and ignores stale in-flight file reads after Clear', async () => {
    render(<VirtualBoyRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Upload Virtual Boy ROM file');

    // Load a ROM first so the Clear button is enabled.
    const loadedRom = createValidRomBytes();
    await act(async () => selectFile(input, new File([loadedRom], 'now.vb')));
    await waitFor(() => expect(screen.getByText('WARIO LAND')).toBeInTheDocument());

    // Start a deferred read and click Clear directly with no second selection in between.
    const deferred = createDeferred();
    utils.readFileAsBytes.mockReturnValueOnce(deferred.promise);
    selectFile(input, new File([createValidRomBytes()], 'late.vb'));

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No ROM loaded')).toBeInTheDocument();

    await act(async () => {
      deferred.resolve(createValidRomBytes({ title: 'STALE GAME' }));
      await Promise.resolve();
    });

    expect(screen.queryByText('STALE GAME')).not.toBeInTheDocument();
    expect(screen.getByText('No ROM loaded')).toBeInTheDocument();
  });

  it('ignores a slower in-flight read when superseded by a second selection', async () => {
    const slowDeferred = createDeferred();
    utils.readFileAsBytes.mockReturnValueOnce(slowDeferred.promise);

    render(<VirtualBoyRomHeaderInspectorTool />);
    const input = screen.getByLabelText('Upload Virtual Boy ROM file');

    selectFile(input, new File([createValidRomBytes()], 'slow.vb'));

    const fastRom = createValidRomBytes({ title: 'FAST GAME' });
    await act(async () => selectFile(input, new File([fastRom], 'fast.vb')));
    await waitFor(() => expect(screen.getByText('FAST GAME')).toBeInTheDocument());

    await act(async () => {
      slowDeferred.resolve(createValidRomBytes({ title: 'SLOW GAME' }));
      await Promise.resolve();
    });

    expect(screen.queryByText('SLOW GAME')).not.toBeInTheDocument();
    expect(screen.getByText('FAST GAME')).toBeInTheDocument();
  });
});
