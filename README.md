# Dev Toolkit ⚡

> All-in-One Developer Tools — built autonomously by an AI swarm.

A curated collection of essential developer utilities, deployed as a static site via GitHub Pages.

## 🛠 Available Tools

| Tool | Description | Status |
|------|-------------|--------|
| Base Converter | Convert numbers between binary, octal, decimal, hexadecimal, and custom bases | ✅ Completed |
| Base64 | Encode and decode Base64 strings without leaving your browser | ✅ Completed |
| Color Converter | Convert between HEX, RGB, and HSL color formats with real-time preview | ✅ Completed |
| Text Diff | Compare two text blocks and quickly spot every change | ✅ Completed |
| Hash Generator | Generate common hashes for content checks and development workflows | ✅ Completed |
| HTML Entity | Encode and decode HTML entities, including Unicode characters | ✅ Completed |
| JSON Formatter | Format, validate, and minify JSON with a clear structured view | ✅ Completed |
| JWT Decoder | Decode JWT claims and inspect expiration details locally | ✅ Completed |
| Regex Tester | Test regular expressions and inspect matches as you type | 🚧 Planned |
| Timestamp Converter | Convert Unix timestamps and human-readable dates in real time | ✅ Completed |
| URL Encoder | Safely encode or decode URL components for requests and redirects | ✅ Completed |
| UUID Generator | Generate and format random UUID v4 or time-ordered UUID v7 batches | ✅ Completed |

## 🤖 Autonomous AI Swarm

This project is developed by an autonomous multi-agent swarm. See [AGENTS.md](./AGENTS.md) for the complete governance and workflow rules.

The orchestrator advances work only after a new lifecycle signal and records
each dispatch persistently, preventing duplicate AI processes across polling
cycles and restarts. A crashed process is retried up to 3 times for the same
event, so one transient CLI failure does not stall the swarm.

```bash
python3 .agents/workflows/test_swarm_orchestrator.py
python3 .agents/workflows/swarm_orchestrator.py --status
```

## 🚀 Development

Install the dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

Run the test suite:

```bash
npm test
```

Create a production build before submitting changes:

```bash
npm run build
```

## 🏗 Architecture

The application is a React single-page app built with Vite. `App.jsx` never lists tools by hand —
it discovers them automatically with `import.meta.glob`, scanning `src/tools/*/meta.js` for
metadata and `src/tools/*/*Tool.jsx` for a matching component. A tool whose metadata has no
matching component yet is rendered as a "Planned" placeholder instead of being omitted. The
shared layout and navigation render whichever tool is selected. Each tool keeps its UI, logic,
styles, and tests together in its own self-contained directory.

```text
src/
├── main.jsx                 # React entry point
├── App.jsx                  # Auto-discovers tools via import.meta.glob — never edited per tool
├── index.css                # Global styles and design tokens
├── components/              # Shared layout and navigation
└── tools/
    ├── base64/              # Base64 UI, utilities, styles, and tests
    ├── json/                # JSON formatter UI, utilities, styles, and tests
    └── regex/               # meta.js only — renders as the Planned placeholder
```

### Adding a Tool

1. Create a self-contained directory at `src/tools/<slug>/`.
2. Add `meta.js` with a default export (`id`, `name`, `description`, `icon`, `category`) — this
   alone makes the tool discoverable and shows it as "Planned" in the sidebar.
3. Add `<Name>Tool.jsx` implementing the tool's UI; once present, auto-discovery picks it up and
   the tool switches from the placeholder to "Completed" automatically.
4. Add the utility module, styles, and unit tests alongside the component.
5. Do **not** edit `src/App.jsx` — tool discovery is fully automatic via `import.meta.glob` and
   adding a registry entry there is neither required nor expected.
6. Run `npm test -- --run` and `npm run build`.

## 🤝 Contributing

Development follows the autonomous multi-agent workflow defined in
[AGENTS.md](./AGENTS.md). Read it and the rules in [`.agents/rules/`](./.agents/rules/) before
starting. All changes must use an isolated worktree and follow the documented
Issue → PR → review → merge process, including distinct Worker, Reviewer, and
Maintainer roles.

## 📦 Deploy

```bash
npm run deploy
```

## License

MIT
