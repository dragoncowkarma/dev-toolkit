import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import IsbnValidatorTool from './IsbnValidatorTool.jsx';

afterEach(cleanup);

describe('IsbnValidatorTool', () => {
  it('loads an ISBN-10 sample and displays validation and ISBN-13 conversion', () => {
    render(<IsbnValidatorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load ISBN-10 sample' }));

    expect(screen.getByLabelText('ISBN-10 or ISBN-13')).toHaveValue('0-306-40615-2');
    expect(screen.getByLabelText('Validated ISBN details')).toHaveTextContent('Valid ISBN-10');
    expect(screen.getByLabelText('Validated ISBN details')).toHaveTextContent('9780306406157');
  });

  it('loads an ISBN-13 sample and shows its conversion restriction', () => {
    render(<IsbnValidatorTool />);
    fireEvent.click(screen.getByRole('button', { name: 'Load ISBN-13 sample' }));

    expect(screen.getByLabelText('Validated ISBN details')).toHaveTextContent('Valid ISBN-13');
    expect(screen.getByRole('alert')).toHaveTextContent('979');
  });

  it('connects validation failures to an accessible error alert and clears the input', () => {
    render(<IsbnValidatorTool />);
    const input = screen.getByLabelText('ISBN-10 or ISBN-13');
    fireEvent.change(input, { target: { value: '9780306406158' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'isbn-validation-error');
    expect(screen.getByRole('alert')).toHaveTextContent('MOD-10');

    fireEvent.click(screen.getByRole('button', { name: 'Clear ISBN' }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
