import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SunRasterTool from './SunRasterTool.jsx';

afterEach(cleanup);

it('clears metadata and announces an error after invalid input', () => {
  render(<SunRasterTool />);
  const input = screen.getByLabelText('File data');
  const valid = '59a66a950000000100000001000000180000000400000001000000000000000000000000';
  fireEvent.change(input, { target: { value: valid } });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect data' }));
  expect(screen.getByText('Width')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '0000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Inspect data' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/truncated/i);
  expect(screen.queryByText('Width')).not.toBeInTheDocument();
});
