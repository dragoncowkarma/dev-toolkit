import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import WmfHeaderInspectorTool from './WmfHeaderInspectorTool.jsx';

function createPlaceableWmfBytes({
  left = 0,
  top = 0,
  right = 100,
  bottom = 100,
  unitsPerInch = 1440,
  handle = 0,
  type = 1,
  version = 0x0300,
  objectCount = 2,
  maxRecord = 6,
  memberCount = 0,
} = {}) {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);

  // Aldus Placeable Header (22 bytes)
  view.setUint32(0, 0x9ac6cdd7, true);
  view.setUint16(4, handle, true);
  view.setInt16(6, left, true);
  view.setInt16(8, top, true);
  view.setInt16(10, right, true);
  view.setInt16(12, bottom, true);
  view.setUint16(14, unitsPerInch, true);
  view.setUint32(16, 0, true);

  let checksum = 0;
  for (let index = 0; index < 10; index += 1) {
    checksum ^= view.getUint16(index * 2, true);
  }
  view.setUint16(20, checksum, true);

  // META_HEADER (18 bytes at offset 22)
  view.setUint16(22, type, true);
  view.setUint16(24, 9, true);
  view.setUint16(26, version, true);
  view.setUint32(28, 9, true);
  view.setUint16(32, objectCount, true);
  view.setUint32(34, maxRecord, true);
  view.setUint16(38, memberCount, true);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const checksumHex = `0x${checksum.toString(16).padStart(4, '0')} (valid)`;
  const boundsText = `${left}, ${top}, ${right}, ${bottom}`;

  return { bytes, hex, checksumHex, boundsText, unitsPerInch };
}

it('reports invalid input accessibly and renders valid WMF headers', () => {
  render(<WmfHeaderInspectorTool />);
  const textarea = screen.getByLabelText('WMF file contents');
  fireEvent.change(textarea, { target: { value: 'xyz' } });
  expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i);

  const validNonPlaceableHex = '0100 0900 0003 09000000 0200 05000000 0000';
  fireEvent.change(textarea, { target: { value: validNonPlaceableHex } });
  expect(screen.getByRole('heading', { name: 'Header summary' })).toBeInTheDocument();
  expect(screen.getByText('No (standard WMF)')).toBeInTheDocument();
});

it('renders placeable header fields when valid Aldus WMF is entered as text', () => {
  render(<WmfHeaderInspectorTool />);

  const sample = createPlaceableWmfBytes({
    left: 10,
    top: 20,
    right: 300,
    bottom: 250,
    unitsPerInch: 1440,
  });

  const textarea = screen.getByLabelText('WMF file contents');
  fireEvent.change(textarea, { target: { value: sample.hex } });

  expect(screen.getByRole('heading', { name: 'Header summary' })).toBeInTheDocument();
  expect(screen.getByText('Placeable header')).toBeInTheDocument();
  expect(screen.getByText('Yes (Aldus)')).toBeInTheDocument();
  expect(screen.getByText('0x9AC6CDD7')).toBeInTheDocument();
  expect(screen.getByText('Bounding box (left, top, right, bottom)')).toBeInTheDocument();
  expect(screen.getByText(sample.boundsText)).toBeInTheDocument();
  expect(screen.getByText('Units per inch')).toBeInTheDocument();
  expect(screen.getByText(String(sample.unitsPerInch))).toBeInTheDocument();
  expect(screen.getByText('Checksum')).toBeInTheDocument();
  expect(screen.getByText(sample.checksumHex)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('renders placeable header fields when a valid WMF file is uploaded', async () => {
  render(<WmfHeaderInspectorTool />);

  const sample = createPlaceableWmfBytes({
    left: -15,
    top: -30,
    right: 450,
    bottom: 350,
    unitsPerInch: 2540,
  });

  const file = new File([sample.bytes], 'sample.wmf', { type: 'image/wmf' });
  file.arrayBuffer = () => Promise.resolve(sample.bytes.buffer);
  const fileInput = screen.getByLabelText('Or upload a WMF file');
  fireEvent.change(fileInput, { target: { files: [file] } });

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: 'Header summary' })).toBeInTheDocument();
  });

  expect(screen.getByText('Placeable header')).toBeInTheDocument();
  expect(screen.getByText('Yes (Aldus)')).toBeInTheDocument();
  expect(screen.getByText('0x9AC6CDD7')).toBeInTheDocument();
  expect(screen.getByText('Bounding box (left, top, right, bottom)')).toBeInTheDocument();
  expect(screen.getByText(sample.boundsText)).toBeInTheDocument();
  expect(screen.getByText('Units per inch')).toBeInTheDocument();
  expect(screen.getByText(String(sample.unitsPerInch))).toBeInTheDocument();
  expect(screen.getByText('Checksum')).toBeInTheDocument();
  expect(screen.getByText(sample.checksumHex)).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('ignores an older file read after text changes', async () => {
  render(<WmfHeaderInspectorTool />);
  let resolveRead;
  const file = new File(['x'], 'test.wmf');
  file.arrayBuffer = () => new Promise((resolve) => { resolveRead = resolve; });
  fireEvent.change(screen.getByLabelText('Or upload a WMF file'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('WMF file contents'), { target: { value: 'xyz' } });
  resolveRead(new ArrayBuffer(40));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/hexadecimal/i));
});
