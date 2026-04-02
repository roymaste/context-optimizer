# Context Optimizer

**Keep AI agents from forgetting. Keep context small.**

## What It Does

A dual-memory architecture that keeps your LLM context under 500 tokens while preserving critical information:

- **Hot Layer** (<500 tokens): Recent summaries, decisions, current tasks
- **Cold Layer** (unlimited): Full history, vector-indexed for retrieval

## Why

LLM applications suffer from:
- Context window overflow
- Memory loss between sessions  
- Token explosion with long conversations
- No synchronization across agents

Context Optimizer solves these with automatic summarization and smart memory分层.

## Quick Start

```javascript
const { ContextOptimizer } = require('./scripts/context-optimizer');

const optimizer = new ContextOptimizer();

// After conversation
await optimizer.summarize(messages);

// Get optimized context
const hotContext = optimizer.getHotContext();
console.log(optimizer.getStats());
// {tokenCount: 280, maxTokens: 500}
```

## For OpenClaw Agents

```javascript
const { onAgentStartup } = require('./scripts/agent-memory-helper');

// Agent startup - builds hot context from files
const context = await onAgentStartup('agent-name');
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
│  COLD Layer (unlimited)             │
│  - Full conversation history        │
│  - Vector indexed for retrieval      │
│  - Loaded on-demand                 │
└─────────────────────────────────────┘
```

## Scripts

| Script | Purpose |
|--------|---------|
| `context-optimizer.js` | Core summary engine |
| `dual-memory.js` | Hot+cold with vector search |
| `sidecar-updater.js` | Persistent per-agent memory |
| `agent-memory-helper.js` | Startup context builder |

## Install

```bash
# For OpenClaw
clawhub install context-optimizer

# Or copy scripts directly
cp -r scripts/your-project/
```

## License

MIT
