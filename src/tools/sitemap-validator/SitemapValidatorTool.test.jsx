import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SitemapValidatorTool from './SitemapValidatorTool.jsx';

afterEach(cleanup);

describe('SitemapValidatorTool', () => {
  it('loads a standard sitemap sample and renders its extracted table entries', () => {
    render(<SitemapValidatorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load sitemap sample' }));

    expect(screen.getByLabelText('XML sitemap').value).toContain('<urlset');
    expect(screen.getByText('https://example.com/')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/docs?ref=sitemap&page=1')).toBeInTheDocument();
    expect(screen.getByLabelText('Validation summary')).toHaveTextContent('Total entries2');
    expect(screen.getAllByText('Valid')).toHaveLength(2);
  });

  it('loads a sitemap index sample', () => {
    render(<SitemapValidatorTool />);

    fireEvent.click(screen.getByRole('button', { name: 'Load index sample' }));

    expect(screen.getByText('https://example.com/sitemaps/pages.xml')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/sitemaps/articles.xml')).toBeInTheDocument();
  });

  it('filters extracted entries by search text and issue state', () => {
    render(<SitemapValidatorTool />);
    fireEvent.change(screen.getByLabelText('XML sitemap'), {
      target: {
        value: '<urlset><url><loc>https://keep.example/</loc></url>'
          + '<url><loc>/bad</loc></url></urlset>',
      },
    });

    fireEvent.change(screen.getByLabelText('Search URLs'), { target: { value: 'keep' } });
    expect(screen.getByText('https://keep.example/')).toBeInTheDocument();
    expect(screen.queryByText('/bad')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search URLs'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'issues' } });
    const row = screen.getByText('/bad').closest('tr');
    expect(within(row).getByText('1 issue')).toBeInTheDocument();
    expect(screen.queryByText('https://keep.example/')).not.toBeInTheDocument();
  });

  it('reports malformed XML in an accessible error state', () => {
    render(<SitemapValidatorTool />);
    fireEvent.change(screen.getByLabelText('XML sitemap'), {
      target: { value: '<urlset><url><loc>https://example.com/?x=1&y=2</loc></url></urlset>' },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Malformed XML/);
    expect(screen.getByLabelText('Validation summary')).toHaveTextContent('Errors1');
  });
});
