import React from 'react';
import Layout from './components/Layout.jsx';
const Base64Tool = React.lazy(() => import('./tools/base64/Base64Tool.jsx'));
const HashTool = React.lazy(() => import('./tools/hash/HashTool.jsx'));
const JsonTool = React.lazy(() => import('./tools/json/JsonTool.jsx'));
const JwtTool = React.lazy(() => import('./tools/jwt/JwtTool.jsx'));
const UrlTool = React.lazy(() => import('./tools/url/UrlTool.jsx'));
const UuidTool = React.lazy(() => import('./tools/uuid/UuidTool.jsx'));
const DiffTool = React.lazy(() => import('./tools/diff/DiffTool.jsx'));

const TOOLS = [
  {
    id: 'base64',
    name: 'Base64',
    description: 'Encode and decode Base64 strings without leaving your browser.',
    icon: '⌁',
    category: 'Encoder',
    component: Base64Tool,
  },
  {
    id: 'json',
    name: 'JSON Formatter',
    description: 'Format, validate, and minify JSON with a clear structured view.',
    icon: '{ }',
    category: 'Formatter',
    component: JsonTool,
  },
  {
    id: 'jwt',
    name: 'JWT Decoder',
    description: 'Decode JWT claims and inspect expiration details locally.',
    icon: '◈',
    category: 'Decoder',
    component: JwtTool,
  },
  {
    id: 'url',
    name: 'URL Encoder',
    description: 'Safely encode or decode URL components for requests and redirects.',
    icon: '↗',
    category: 'Encoder',
    component: UrlTool,
  },
  {
    id: 'hash',
    name: 'Hash Generator',
    description: 'Generate common hashes for content checks and development workflows.',
    icon: '#',
    category: 'Generator',
    component: HashTool,
  },
  {
    id: 'uuid',
    name: 'UUID Generator',
    description: 'Generate and format random UUID v4 or time-ordered UUID v7 batches.',
    icon: '⌗',
    category: 'Generator',
    component: UuidTool,
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
    component: DiffTool,
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
