import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import XpathTool from './XpathTool.jsx';

const XML = '<root><item id="1">One</item><item id="2">Two</item></root>';

function fillInputs(xml = XML, expression = '//item') {
  fireEvent.change(screen.getByLabelText('XML input'), { target: { value: xml } });
  fireEvent.change(screen.getByLabelText('XPath expression'), { target: { value: expression } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('XpathTool', () => {
  it('evaluates nodes and announces count and result type', () => {
    render(<XpathTool />);
    fillInputs();

    expect(screen.getByLabelText('XPath output')).toHaveValue(
      '<item id="1">One</item>\n\n<item id="2">Two</item>',
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 matching nodes (NodeSet)');
  });

  it('renders scalar XPath values', () => {
    render(<XpathTool />);
    fillInputs(XML, 'count(//item)');

    expect(screen.getByLabelText('XPath output')).toHaveValue('2');
    expect(screen.getByRole('status')).toHaveTextContent('Number result');
  });

  it('shows alerts for invalid XML and XPath input', () => {
    render(<XpathTool />);
    fillInputs('<root><item></root>', '//item');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid XML');

    fillInputs(XML, '//item[');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid XPath');
  });

  it('loads an XML and XPath sample preset', () => {
    render(<XpathTool />);
    const sample = screen.getByRole('button', { name: 'Load Bookstore nodes sample' });
    fireEvent.click(sample);

    expect(sample).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('XML input').value).toContain('bookstore');
    expect(screen.getByLabelText('XPath expression')).toHaveValue("//book[@id='1']");
  });

  it('copies extracted output and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<XpathTool />);
    fillInputs();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy extracted result' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('<item id="1">One</item>\n\n<item id="2">Two</item>');
    expect(screen.getByText('Extracted result copied to clipboard.')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});
