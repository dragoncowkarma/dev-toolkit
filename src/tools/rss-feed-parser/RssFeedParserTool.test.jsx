import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RssFeedParserTool from './RssFeedParserTool.jsx';

describe('RssFeedParserTool', () => {
  it('renders parsed feed metadata and contextual validation alerts', () => {
    render(<RssFeedParserTool />);
    const input = screen.getByLabelText('Feed XML');
    fireEvent.change(input, {
      target: { value: '<rss><channel><title>Example</title></channel></rss>' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'RSS <channel> is missing required <link>.'
    );
    expect(screen.getByRole('heading', { name: 'Example' })).toBeInTheDocument();
  });
});
