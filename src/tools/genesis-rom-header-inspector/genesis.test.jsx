import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GenesisRomHeaderTool from './GenesisRomHeaderTool.jsx';
import { parseGenesisRom } from './genesis.utils.js';

function rom() {
  const data = new Uint8Array(0x203);
  const write = (offset, value) => data.set([...value].map((c) => c.charCodeAt(0)), offset);
  write(0x100, 'SEGA GENESIS');
  write(0x110, '(C)SEGA 1994');
  write(0x120, 'DOMESTIC');
  write(0x150, 'OVERSEAS');
  write(0x180, 'GM 12345678-00');
  write(0x190, 'J6');
  write(0x1f0, 'JUE');
  const view = new DataView(data.buffer);
  view.setUint16(0x18e, 0x1334);
  view.setUint32(0x1a4, 0x12345678);
  view.setUint32(0x1a8, 0xff0000);
  data.set([0x12, 0x34, 0x01], 0x200);
  return data.buffer;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Genesis ROM inspector', () => {
  it('decodes header fields and big-endian checksum including an odd final byte', () => {
    expect(parseGenesisRom(rom())).toMatchObject({
      system: 'SEGA GENESIS', copyright: '(C)SEGA 1994', domesticTitle: 'DOMESTIC',
      overseasTitle: 'OVERSEAS', serial: 'GM 12345678-00', devices: 'J6', region: 'JUE',
      romEnd: 0x12345678, ramStart: 0xff0000, checksum: 0x1334, calculatedChecksum: 0x1334,
    });
  });
  it('reports truncated and malformed files', () => {
    expect(() => parseGenesisRom(new ArrayBuffer(0x1ff))).toThrow(/too short/);
    expect(() => parseGenesisRom(new ArrayBuffer(0x200))).toThrow(/recognizable/);
  });
  it('shows a checksum mismatch and alerts for a truncated file', async () => {
    render(<GenesisRomHeaderTool />);
    const data = rom();
    new DataView(data).setUint16(0x18e, 0);
    fireEvent.change(screen.getByLabelText('ROM file'), {
      target: { files: [new File([data], 'bad.bin')] },
    });
    expect(await screen.findByText('Checksum: Mismatch')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ROM file'), {
      target: { files: [new File(['short'], 'short.bin')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('too short');
  });
  it('ignores stale file reads', () => {
    const readers = [];
    class Reader {
      constructor() { readers.push(this); }
      readAsArrayBuffer() {}
    }
    vi.stubGlobal('FileReader', Reader);
    render(<GenesisRomHeaderTool />);
    const input = screen.getByLabelText('ROM file');
    fireEvent.change(input, { target: { files: [new File(['a'], 'old.bin')] } });
    fireEvent.change(input, { target: { files: [new File(['b'], 'new.bin')] } });
    readers[1].result = rom();
    act(() => readers[1].onload());
    readers[0].result = new ArrayBuffer(1);
    act(() => readers[0].onload());
    expect(screen.getByText('Checksum: Match')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
