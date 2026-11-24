import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import BcachefsSuperblockInspectorTool from './BcachefsSuperblockInspectorTool.jsx';

afterEach(cleanup);

it('loads sample data and shows its fields and checksum', async () => {
  render(<BcachefsSuperblockInspectorTool />);
  await userEvent.click(screen.getByRole('button', { name: /sample data/i }));
  expect(screen.getByText('Example volume')).toBeInTheDocument();
  expect(screen.getByText('Match')).toBeInTheDocument();
  expect(screen.getByText('Device 0: 8388608 sectors')).toBeInTheDocument();
  expect(screen.getByText('Type 1: 64 bytes')).toBeInTheDocument();
});

it('shows an explicit error for a short upload', async () => {
  render(<BcachefsSuperblockInspectorTool />);
  await userEvent.upload(screen.getByLabelText('Disk image'), new File(['bad'], 'bad.img'));
  expect(await screen.findByRole('alert')).toHaveTextContent(/truncated/i);
});
