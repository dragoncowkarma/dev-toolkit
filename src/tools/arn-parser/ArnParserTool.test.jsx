import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ArnParserTool from './ArnParserTool.jsx';

afterEach(() => {
  cleanup();
});

describe('ArnParserTool', () => {
  it('renders nothing in the results list before any input', () => {
    render(<ArnParserTool />);
    expect(screen.queryByLabelText('Parsed ARN results')).not.toBeInTheDocument();
  });

  it('parses a valid ARN and shows its components', () => {
    render(<ArnParserTool />);
    fireEvent.change(screen.getByLabelText('One ARN per line'), {
      target: { value: 'arn:aws:iam::123456789012:role/path/to/role' },
    });

    expect(screen.getByText('✓ Valid')).toBeInTheDocument();
    expect(screen.getByText('iam')).toBeInTheDocument();
    expect(screen.getByText('123456789012')).toBeInTheDocument();
    expect(screen.getByText('role')).toBeInTheDocument();
    expect(screen.getByText('path/to/role')).toBeInTheDocument();
  });

  it('shows an inline error for a malformed ARN', () => {
    render(<ArnParserTool />);
    fireEvent.change(screen.getByLabelText('One ARN per line'), {
      target: { value: 'not-an-arn' },
    });

    expect(screen.getByText('✕ Invalid')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Too few segments/);
  });

  it('validates each line of batch input independently', () => {
    render(<ArnParserTool />);
    fireEvent.change(screen.getByLabelText('One ARN per line'), {
      target: { value: 'arn:aws:s3:::good-bucket\nnot-an-arn' },
    });

    expect(screen.getByText('✓ Valid')).toBeInTheDocument();
    expect(screen.getByText('✕ Invalid')).toBeInTheDocument();
  });

  it('loads sample ARNs', () => {
    render(<ArnParserTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load samples' }));

    const textarea = screen.getByLabelText('One ARN per line');
    expect(textarea.value).toContain('arn:aws:iam::123456789012:role/path/to/role');
  });

  it('clears the input', () => {
    render(<ArnParserTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load samples' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('One ARN per line')).toHaveValue('');
    expect(screen.queryByLabelText('Parsed ARN results')).not.toBeInTheDocument();
  });
});
