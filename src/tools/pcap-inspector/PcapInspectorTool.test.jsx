import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PcapInspectorTool from './PcapInspectorTool.jsx';

function makePcap() {
  const buffer = new ArrayBuffer(40);
  const view = new DataView(buffer);
  view.setUint32(0, 0xd4c3b2a1, false);
  view.setUint16(4, 2, true);
  view.setUint16(6, 4, true);
  view.setUint32(16, 65535, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 10, true);
  view.setUint32(28, 20, true);
  return buffer;
}

function makeDecodedPcap() {
  const payload = [
    0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 8, 0,
    69, 0, 0, 24, 0, 0, 0, 0, 64, 6, 0, 0, 192, 0, 2, 1, 198, 51, 100, 2,
    1, 187, 31, 144,
  ];
  const buffer = new ArrayBuffer(40 + payload.length);
  const view = new DataView(buffer);
  view.setUint32(0, 0xd4c3b2a1, false);
  view.setUint16(4, 2, true);
  view.setUint16(6, 4, true);
  view.setUint32(16, 65535, true);
  view.setUint32(20, 1, true);
  view.setUint32(32, payload.length, true);
  view.setUint32(36, payload.length, true);
  new Uint8Array(buffer, 40).set(payload);
  return buffer;
}

function selectFile(file) {
  const input = screen.getByLabelText('Choose a PCAP file to inspect');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

afterEach(cleanup);

describe('PcapInspectorTool', () => {
  it('renders parsed header and packet information without uploading the file', async () => {
    render(<PcapInspectorTool />);
    selectFile({ name: 'capture.pcap', size: 40, arrayBuffer: async () => makePcap() });

    expect(await screen.findByRole('heading', { name: 'capture.pcap' })).toBeInTheDocument();
    expect(screen.getByText('Ethernet (1)')).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Parsed packet records' }),
    ).toHaveTextContent('10.000020');
    expect(screen.getByText(/Files are parsed locally/)).toBeInTheDocument();
  });

  it('shows a clear error for malformed input and clears it', async () => {
    render(<PcapInspectorTool />);
    selectFile({ name: 'bad.bin', size: 4, arrayBuffer: async () => new ArrayBuffer(4) });

    expect(await screen.findByRole('alert')).toHaveTextContent('not a classic PCAP');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('renders decoded network header columns when a packet includes IPv4 data', async () => {
    render(<PcapInspectorTool />);
    selectFile({ name: 'decoded.pcap', size: 78, arrayBuffer: async () => makeDecodedPcap() });

    expect(await screen.findByText('Destination MAC')).toBeInTheDocument();
    expect(screen.getByText('00:11:22:33:44:55')).toBeInTheDocument();
    expect(screen.getByText('192.0.2.1')).toBeInTheDocument();
    expect(screen.getByText('TCP')).toBeInTheDocument();
  });
});
