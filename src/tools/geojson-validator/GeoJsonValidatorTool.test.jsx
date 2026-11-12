import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GeoJsonValidatorTool from './GeoJsonValidatorTool.jsx';

afterEach(cleanup);

describe('GeoJsonValidatorTool', () => {
  it('validates pasted GeoJSON and displays its summary', () => {
    render(<GeoJsonValidatorTool />);

    fireEvent.change(screen.getByLabelText('GeoJSON document'), {
      target: { value: '{"type":"Point","coordinates":[127,37.5]}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate GeoJSON' }));

    expect(screen.getByRole('status')).toHaveTextContent('Valid GeoJSON.');
    expect(screen.getByText(/Bounding box:/).parentElement)
      .toHaveTextContent('[127, 37.5, 127, 37.5]');
    expect(screen.getByText('Point: 1')).toBeInTheDocument();
  });

  it('displays every validation error', () => {
    render(<GeoJsonValidatorTool />);

    fireEvent.change(screen.getByLabelText('GeoJSON document'), {
      target: { value: '{"type":"Point","coordinates":[181,-91]}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Validate GeoJSON' }));

    expect(screen.getByRole('status')).toHaveTextContent('2 validation errors found.');
    expect(screen.getByText('coordinates[0]')).toBeInTheDocument();
    expect(screen.getByText('coordinates[1]')).toBeInTheDocument();
  });

  it('asks for input rather than validating an empty document', () => {
    render(<GeoJsonValidatorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Validate GeoJSON' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Paste a GeoJSON document to validate.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
