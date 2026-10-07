# Devpost Submission Content — CodeSentinel

## Project Title
CodeSentinel — AI Codebase Health Agent for Slack

## Track
New Slack Agent

## Technologies Used (pick at least 1)
- Slack AI capabilities (Agent Builder, suggested prompts, assistant view)
- MCP server integration (6 analysis tools via Model Context Protocol)
- Real-Time Search API (context-aware repo URL discovery in workspace)

## Short Description (1-2 sentences)
CodeSentinel is a Slack AI agent that analyzes your codebase for dead code, circular dependencies, high coupling, and architectural drift — surfacing rich, actionable Block Kit reports with severity-coded findings and AI-powered fix suggestions, all without leaving Slack.

## Long Description (Devpost submission body)

### The Problem

Every engineering team faces it: codebases grow organically, and over time, invisible health problems accumulate. Dead code bloats the codebase and confuses new developers. Circular dependencies prevent tree-shaking and cause initialization bugs. Excessive coupling makes every change a minefield. Architectural drift erodes the carefully designed layer boundaries that keep the system maintainable.

The tools to detect these problems exist — linters, static analyzers, CI checks — but they produce noise in dashboards that nobody checks. They require specialized knowledge to configure and interpret. And they're disconnected from the place where developers actually discuss and act on code quality: Slack.

### The Solution

CodeSentinel brings codebase health analysis directly into Slack as an AI agent. It's always available in the assistant sidebar, ready to scan your codebase with a single click or a natural language message.

**What it detects:**
- **Dead code**: Functions, classes, and modules defined but never referenced, with line numbers and fix suggestions
- **Circular dependencies**: Module import cycles detected via DFS, with impact assessment
- **Coupling issues**: Fan-out metrics and tightly coupled cluster identification
- **Architectural drift**: Layer boundary violations (e.g., UI directly importing from the data layer)

**How it delivers results:**
- Rich Block Kit messages with severity-coded findings (🔴 critical, 🟡 warning, 🔵 info)
- Overall health scores (0-100) for full scans
- Specific, actionable fix suggestions for every finding
- AI-powered executive summaries via LLM integration

### Technologies

**Slack AI capabilities**: CodeSentinel uses the Slack Agent Builder framework with suggested prompts, the assistant side panel, and thread-based conversations. It classifies user intent from natural language messages and routes to the appropriate analyzer.

**MCP Server Integration**: CodeSentinel exposes 6 analysis tools via the Model Context Protocol:
1. `analyze_dead_code` — Find unreferenced definitions
2. `detect_circular_deps` — Find module import cycles
3. `analyze_coupling` — Measure fan-out and cluster coupling
4. `detect_architectural_drift` — Check layer boundary violations
5. `full_health_scan` — Complete analysis with health score
6. `explain_finding` — AI-powered detailed explanation of any finding

This means CodeSentinel's analysis isn't locked inside Slack — any MCP-compatible client (Claude Desktop, Cursor, Windsurf, etc.) can use the same tools, making the analysis capabilities universally accessible.

**Real-Time Search API**: CodeSentinel uses workspace search to find repository URLs mentioned in channels, enabling context-aware analysis without requiring explicit configuration.

### Built With
- Bolt for Node.js (Slack app framework)
- Block Kit (rich Slack UI)
- Model Context Protocol SDK (tool exposure)
- Deepseek, OpenAI, or Amazon Nova on Bedrock (LLM for summaries and explanations)

### Architecture

CodeSentinel follows a clean architecture pattern:
1. **Intent Parser** classifies natural language into analysis types
2. **Analysis Engine** orchestrates the appropriate analyzer
3. **Analyzers** (dead code, circular deps, coupling, drift) produce structured findings
4. **Block Kit Builder** transforms findings into rich Slack messages
5. **MCP Server** exposes the same analyzers as protocol tools
6. **LLM Provider** generates executive summaries and explanations

See the architecture diagram for the full system overview.

### Future Roadmap
- Real AST-based analysis (ts-morph for TypeScript, tree-sitter for multi-language)
- GitHub App integration for automatic analysis on PRs
- Historical trend tracking — is your codebase getting healthier?
- Custom architecture rule configuration via Slack commands
- Team health dashboards in Slack Canvas

### Why Slack?
Slack is where engineering teams discuss code, triage issues, and make decisions. By surfacing code health insights directly in Slack, CodeSentinel turns invisible problems into visible, actionable conversations. No context switching, no dashboards, no specialized tools — just ask the agent.

## Demo Video
[Link to ~3 minute demo video showing live interaction in Slack sandbox]

## Architecture Diagram
[Uploaded: architecture-diagram.png]

## Slack Developer Sandbox URL
cubiczan.enterprise.slack.com

## Judge Access
slackhack@salesforce.com and testing@devpost.com have been granted access to the sandbox workspace.