import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import RegexTool from './RegexTool.jsx';

afterEach(() => {
  cleanup();
});

describe('RegexTool Component', () => {
  it('renders with default preset (Email)', () => {
    render(<RegexTool />);

    const patternInput = screen.getByLabelText('Regular expression pattern');
    const testTextInput = screen.getByLabelText('Test Text');

    expect(patternInput).toHaveValue('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}');
    expect(testTextInput.value).toContain('support@company.com');
    expect(screen.getByText(/2 matches found/i)).toBeInTheDocument();
  });

  it('updates matches when pattern or test text changes', () => {
    render(<RegexTool />);

    const patternInput = screen.getByLabelText('Regular expression pattern');
    const testTextInput = screen.getByLabelText('Test Text');

    fireEvent.change(patternInput, { target: { value: '\\d+' } });
    fireEvent.change(testTextInput, { target: { value: 'Item 123 and 456' } });

    expect(screen.getByText(/2 matches found/i)).toBeInTheDocument();
    expect(screen.getAllByText('123').length).toBeGreaterThan(0);
    expect(screen.getAllByText('456').length).toBeGreaterThan(0);
  });

  it('toggles flags correctly', () => {
    render(<RegexTool />);

    const gFlagBtn = screen.getByRole('button', { name: 'Toggle flag g' });
    expect(gFlagBtn).toHaveAttribute('aria-pressed', 'true');

    // Turn off 'g' flag
    fireEvent.click(gFlagBtn);
    expect(gFlagBtn).toHaveAttribute('aria-pressed', 'false');

    // Match count should change from 2 matches to 1 match
    expect(screen.getByText(/1 match found/i)).toBeInTheDocument();

    // Turn 'g' flag back on
    fireEvent.click(gFlagBtn);
    expect(gFlagBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/2 matches found/i)).toBeInTheDocument();
  });

  it('displays real-time error alert for invalid regex', () => {
    render(<RegexTool />);

    const patternInput = screen.getByLabelText('Regular expression pattern');

    fireEvent.change(patternInput, { target: { value: '[invalid(' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/0 matches found/i)).toBeInTheDocument();
  });

  it('changes preset when selected from dropdown', () => {
    render(<RegexTool />);

    const presetSelect = screen.getByLabelText('Regex Presets');

    fireEvent.change(presetSelect, { target: { value: 'ipv4' } });

    const patternInput = screen.getByLabelText('Regular expression pattern');
    expect(patternInput.value).toContain('25[0-5]');
    expect(screen.getAllByText(/127.0.0.1/).length).toBeGreaterThan(0);
  });

  it('displays capture groups in a table when present', () => {
    render(<RegexTool />);

    const patternInput = screen.getByLabelText('Regular expression pattern');
    const testTextInput = screen.getByLabelText('Test Text');

    fireEvent.change(patternInput, { target: { value: '(\\w+)@(\\w+\\.\\w+)' } });
    fireEvent.change(testTextInput, { target: { value: 'user@example.com' } });

    expect(screen.getByText('Group #1')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('Group #2')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('clears pattern, flags, test text, and matches when Clear button is clicked', () => {
    render(<RegexTool />);

    const clearBtn = screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(clearBtn);

    expect(screen.getByLabelText('Regular expression pattern')).toHaveValue('');
    expect(screen.getByLabelText('Test Text')).toHaveValue('');
    expect(screen.getByText(/No matches found/i)).toBeInTheDocument();
  });
});
