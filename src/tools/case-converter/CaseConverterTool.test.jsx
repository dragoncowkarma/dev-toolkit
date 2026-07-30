import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CaseConverterTool from './CaseConverterTool.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CaseConverterTool conversion', () => {
  it('converts input to every case in real time', async () => {
    render(<CaseConverterTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'user_id' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('camelCase')).toHaveValue('userId');
      expect(screen.getByLabelText('PascalCase')).toHaveValue('UserId');
      expect(screen.getByLabelText('snake_case')).toHaveValue('user_id');
      expect(screen.getByLabelText('kebab-case')).toHaveValue('user-id');
      expect(screen.getByLabelText('CONSTANT_CASE')).toHaveValue('USER_ID');
      expect(screen.getByLabelText('Title Case')).toHaveValue('User Id');
      expect(screen.getByLabelText('lower case')).toHaveValue('user id');
      expect(screen.getByLabelText('UPPER CASE')).toHaveValue('USER ID');
    });
  });

  it('converts multi-line input line by line', async () => {
    render(<CaseConverterTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'fooBar\nbazQux' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('snake_case')).toHaveValue('foo_bar\nbaz_qux')
    );
  });

  it('recognizes acronyms and numeric boundaries', async () => {
    render(<CaseConverterTool />);
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'XMLHttpRequest_2' },
    });

    await waitFor(() =>
      expect(screen.getByLabelText('snake_case')).toHaveValue('xml_http_request_2')
    );
  });
});

describe('CaseConverterTool actions', () => {
  it('clears the input and all results, reporting feedback', async () => {
    render(<CaseConverterTool />);
    fireEvent.change(screen.getByLabelText('Input text'), { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByLabelText('Input text')).toHaveValue('');
    expect(screen.getByLabelText('camelCase')).toHaveValue('');
    expect(await screen.findByRole('status')).toHaveTextContent('Cleared.');
  });

  it('copies a specific result and reports success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CaseConverterTool />);
    fireEvent.change(screen.getByLabelText('Input text'), { target: { value: 'hello world' } });

    const kebabPanel = screen.getByLabelText('kebab-case').closest('.case-converter-tool__result');
    const copyButton = within(kebabPanel).getByRole('button', { name: 'Copy' });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeText).toHaveBeenCalledWith('hello-world');
    expect(screen.getByRole('status')).toHaveTextContent('Copied kebab-case to clipboard.');
  });

  it('disables copy buttons when a result is empty', () => {
    render(<CaseConverterTool />);
    const kebabPanel = screen.getByLabelText('kebab-case').closest('.case-converter-tool__result');
    expect(within(kebabPanel).getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});
