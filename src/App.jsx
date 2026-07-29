import React from 'react';
import Layout from './components/Layout.jsx';

const TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    description: 'Encode and decode Base64 strings without leaving your browser.',
    icon: '⌁',
    category: 'Encoder',
    component: ToolPlaceholder,
  },
  {
    id: 'json',
    name: 'JSON Formatter',
    description: 'Format, validate, and minify JSON with a clear structured view.',
    icon: '{ }',
    category: 'Formatter',
    component: ToolPlaceholder,
  },
  {
    id: 'url',
    name: 'URL Encoder',
    description: 'Safely encode or decode URL components for requests and redirects.',
    icon: '↗',
    category: 'Encoder',
    component: ToolPlaceholder,
  },
  {
    id: 'hash',
    name: 'Hash Generator',
    description: 'Generate common hashes for content checks and development workflows.',
    icon: '#',
    category: 'Generator',
    component: ToolPlaceholder,
  },
  {
    id: 'regex',
    name: 'Regex Tester',
    description: 'Test regular expressions and inspect matches as you type.',
    icon: '.*',
    category: 'Tester',
    component: ToolPlaceholder,
  },
  {
    id: 'diff',
    name: 'Text Diff',
    description: 'Compare two text blocks and quickly spot every change.',
    icon: '±',
    category: 'Comparison',
    component: ToolPlaceholder,
  },
];

function ToolPlaceholder({ tool }) {
  return (
    <section className="tool-placeholder" aria-labelledby={`${tool.id}-title`}>
      <div className="tool-placeholder__intro">
        <span className="tool-placeholder__icon" aria-hidden="true">
          {tool.icon}
        </span>
        <div>
          <p className="tool-placeholder__eyebrow">{tool.category}</p>
          <h2 id={`${tool.id}-title`}>{tool.name}</h2>
        </div>
      </div>

      <p className="tool-placeholder__description">{tool.description}</p>

      <div className="tool-placeholder__preview" aria-label="Tool status">
        <div>
          <p className="tool-placeholder__preview-label">Workspace status</p>
          <p className="tool-placeholder__preview-title">Ready for implementation</p>
        </div>
        <span className="tool-placeholder__status">
          <span aria-hidden="true" />
          Planned
        </span>
      </div>
    </section>
  );
}

/**
 * Renders the developer toolkit application.
 *
 * @returns {React.JSX.Element} The application root.
 */
export default function App() {
  return <Layout tools={TOOLS} defaultToolId="base64" />;
}
