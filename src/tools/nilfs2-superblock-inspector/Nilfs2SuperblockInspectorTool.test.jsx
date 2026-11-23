import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import Nilfs2SuperblockInspectorTool from './Nilfs2SuperblockInspectorTool.jsx';

it('loads and displays the sample superblocks', async () => {
  render(<Nilfs2SuperblockInspectorTool />);
  fireEvent.click(screen.getByRole('button', { name: 'Load sample data' }));
  expect(await screen.findByText('Primary superblock')).toBeTruthy();
  expect(screen.getByText('Secondary superblock')).toBeTruthy();
  expect(screen.getAllByText('VALID: Checksum matches.')).toHaveLength(2);
});
