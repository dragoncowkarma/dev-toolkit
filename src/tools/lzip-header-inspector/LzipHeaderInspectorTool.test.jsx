import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import LzipHeaderInspectorTool from './LzipHeaderInspectorTool.jsx';

afterEach(cleanup);

it('inspects pasted input and reports validation errors', () => {
  render(<LzipHeaderInspectorTool />);
  fireEvent.change(screen.getByLabelText('Paste input'), {
    target: { value: '4c 5a 49 50 01 0c' },
  });
  expect(screen.getByText('4,096 bytes')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Paste input'), { target: { value: '00' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Truncated');
});
