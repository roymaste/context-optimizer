---
name: agent-context-optimizer
description: "Context Optimizer for OpenClaw - Hot/Cold memory layer with auto-summarize. Use when: (1) building multi-agent systems, (2) context window overflow, (3) agents forget between sessions, (4) need memory sync across agents. Hot layer (<500 tokens) + cold layer (vector search) + auto decisions. Zero memory loss. Now with message:received hook for automatic triggering."
---

# Context Optimizer

**Keep AI agents from forgetting. Keep context small.**

## Overview

Solve LLM token explosion and memory loss with a dual-memory architecture:
- **Hot Layer** (<500 tokens): Recent summaries, decisions, current tasks
- **Cold Layer** (unlimited): Full history, vector-indexed for retrieval

**New in v2.0**: Automatic triggering via `message:received` hook - no manual activation needed!

## Quick Start

```bash
# Install
clawhub install agent-context-optimizer

# The skill auto-installs the hook
# Every user message triggers automatic summarize
```

## Architecture

```
┌─────────────────────────────────────┐
│  HOT Layer (<500 tokens)            │
│  - Recent summaries                 │
│  - Decisions                        │
│  - Current tasks                    │
│  - Key facts                        │
├─────────────────────────────────────┤
│  COLD Layer (unlimited)            │
│  - Full conversation history        │
│  - Vector indexed for retrieval     │
│  - Loaded on-demand                │
└─────────────────────────────────────┘
```

## How It Works

### Triggering (v2.0 - Automatic!)

**No manual activation needed!**

The skill installs a hook that listens to `message:received` events:

1. **Every user message** → Hook triggered
2. Hook checks: "Has 5+ minutes passed since last summary?"
3. If yes → Reads transcript → Generates summary → Updates hot layer
4. Agent always has fresh context on startup

### Files

| File | Purpose |
|------|---------|
| `hook/HOOK.md` | Hook metadata (events: message:received) |
| `hook/handler.ts` | Auto-summarize on every user message |
| `scripts/context-optimizer.js` | Core summary engine |
| `scripts/agent-memory-helper.js` | Startup context builder |

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| MIN_INTERVAL_MS | 300000 (5 min) | Min time between summaries |
| HOT_LAYER_FILE | knowledge/agents/main/sidecar.md | Hot layer path |
| LAST_SUMMARY_FILE | memory/.last_summary | Timestamp file |

## Installation

```bash
clawhub install agent-context-optimizer
```

This automatically:
1. Copies hook to `~/.openclaw/hooks/`
2. Enables the hook
3. Creates necessary directories

## Manual Setup

```bash
# Create hook directory
mkdir -p ~/.openclaw/hooks/context-optimizer-session

# Copy files
cp HOOK.md ~/.openclaw/hooks/context-optimizer-session/
cp handler.ts ~/.openclaw/hooks/context-optimizer-session/

# Enable
openclaw hooks enable context-optimizer-session
```

## Events

| Event | Trigger |
|-------|---------|
| `message:received` | Every user message - triggers check |

## Testing

```bash
# Check hook status
openclaw hooks list | grep context-optimizer

# Watch logs
tail -f ~/.openclaw/logs/*.log | grep context-optimizer

# Send a message and check hot layer
cat ~/.openclaw/workspace/knowledge/agents/main/sidecar.md
```

## License

MIT
