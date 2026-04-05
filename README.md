# Context Optimizer

**Keep AI agents from forgetting. Keep context small.**

## What It Does

A dual-memory architecture that keeps your LLM context under 500 tokens while preserving critical information:

- **Hot Layer** (<500 tokens): Recent summaries, decisions, current tasks
- **Cold Layer** (unlimited): Full history, vector-indexed for retrieval

**NEW in v2.0**: Automatic triggering via `message:received` hook!

## Why

LLM applications suffer from:
- Context window overflow
- Memory loss between sessions
- Token explosion with long conversations
- No synchronization across agents

Context Optimizer solves these with automatic summarization and smart memory分层.

## Quick Start

```bash
# Install
clawhub install agent-context-optimizer

# That's it! Hook auto-installs and enables
# Every user message triggers automatic summarize
```

## Architecture

```
┌─────────────────────────────────────┐
│  HOT Layer (<500 tokens)            │
│  - Recent summaries                 │
│  - Decisions                       │
│  - Current tasks                   │
│  - Key facts                       │
├─────────────────────────────────────┤
│  COLD Layer (unlimited)            │
│  - Full conversation history        │
│  - Vector indexed for retrieval     │
│  - Loaded on-demand                │
└─────────────────────────────────────┘
```

## How Auto-Trigger Works

```
User sends message
    ↓
Hook listens to message:received
    ↓
Checks: "5+ minutes since last summary?"
    ↓
Yes → Read transcript → Summarize → Update hot layer
    ↓
Agent always has fresh context
```

## Files

| Path | Purpose |
|------|---------|
| `hook/HOOK.md` | Hook metadata |
| `hook/handler.ts` | Auto-summarize on every message |
| `scripts/context-optimizer.js` | Core engine |
| `scripts/agent-memory-helper.js` | Startup loader |

## Testing

```bash
# Check hook
openclaw hooks list | grep context

# Verify hot layer updates
cat ~/.openclaw/workspace/knowledge/agents/main/sidecar.md
```

## License

MIT
