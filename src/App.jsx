import React, { useState } from 'react';
import Base64Tool from './tools/base64/Base64Tool.jsx';

const TOOLS = [
  { id: 'base64', name: 'Base64', desc: 'Encode & Decode Base64 strings', icon: '🔐', status: 'available' },
  { id: 'json', name: 'JSON Formatter', desc: 'Format, validate & minify JSON', icon: '📋', status: 'planned' },
  { id: 'url', name: 'URL Encoder', desc: 'Encode & Decode URL strings', icon: '🔗', status: 'planned' },
  { id: 'hash', name: 'Hash Generator', desc: 'Generate MD5, SHA-1, SHA-256 hashes', icon: '🔑', status: 'planned' },
  { id: 'regex', name: 'Regex Tester', desc: 'Test & debug regular expressions', icon: '🧪', status: 'planned' },
  { id: 'diff', name: 'Text Diff', desc: 'Compare two texts side by side', icon: '📝', status: 'planned' },
];

const TOOL_COMPONENTS = {
  base64: Base64Tool,
};

function ToolCard({ tool, onOpen }) {
  const isAvailable = tool.status === 'available';
  return (
    <div
      className={`tool-card ${isAvailable ? 'tool-card-clickable' : ''}`}
      role={isAvailable ? 'button' : undefined}
      tabIndex={isAvailable ? 0 : undefined}
      onClick={isAvailable ? () => onOpen(tool.id) : undefined}
      onKeyDown={
        isAvailable
          ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpen(tool.id)
          : undefined
      }
    >
      <div className="tool-icon">{tool.icon}</div>
      <h3 className="tool-name">{tool.name}</h3>
      <p className="tool-desc">{tool.desc}</p>
      <span className={`tool-status status-${tool.status}`}>
        {isAvailable ? '✅ Available' : '🚧 Coming Soon'}
      </span>
    </div>
  );
}

export default function App() {
  const [activeToolId, setActiveToolId] = useState(null);
  const ActiveTool = activeToolId ? TOOL_COMPONENTS[activeToolId] : null;
  const activeTool = TOOLS.find((tool) => tool.id === activeToolId);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="logo" onClick={() => setActiveToolId(null)} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">⚡</span>
            <h1>Dev Toolkit</h1>
          </div>
          <p className="tagline">All-in-One Developer Tools</p>
        </div>
      </header>

      <main className="main">
        {ActiveTool ? (
          <>
            <section className="hero tool-hero">
              <button type="button" className="back-link" onClick={() => setActiveToolId(null)}>
                ← Back to all tools
              </button>
              <h2>{activeTool.name}</h2>
              <p>{activeTool.desc}</p>
            </section>
            <ActiveTool />
          </>
        ) : (
          <>
            <section className="hero">
              <h2>Essential utilities, always at hand.</h2>
              <p>A curated collection of developer tools built by an autonomous AI swarm.</p>
            </section>

            <section className="tools-grid">
              {TOOLS.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onOpen={setActiveToolId} />
              ))}
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <p>Built autonomously by the AI Swarm 🤖 &middot; <a href="https://github.com/dragoncowkarma/dev-toolkit" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  );
}
