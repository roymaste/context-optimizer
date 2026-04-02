---
name: context-optimizer
description: "Keep AI agents from forgetting. Keep context small. Use when: (1) building multi-agent systems, (2) context window overflow, (3) agents forget between sessions, (4) need memory sync across agents. Hot layer (<500 tokens) + cold layer (vector search) + auto decisions. Zero memory loss."
---

# Context Optimizer

## Overview

Solve LLM token explosion and memory loss with a dual-memory architecture: hot-layer (<500 tokens) for immediate context, cold-layer for persistent storage. Enables "low token, zero memory loss" for agent systems.

## Quick Start

```javascript
// 1. Import the optimizer
const { ContextOptimizer } = require('./scripts/context-optimizer');

// 2. Create instance
const optimizer = new ContextOptimizer();

// 3. After conversation ends - auto-summary
await optimizer.summarize(conversationMessages);

// 4. Get hot context for next turn
const hotContext = optimizer.getHotContext();

// 5. Check stats
console.log(optimizer.getStats());
// {summaryCount: 1, decisionCount: 3, taskCount: 2, tokenCount: 280, maxTokens: 500}
```

## Core Concepts

### Dual-Layer Architecture

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
│  - Vector indexed for retrieval     │
│  - Loaded on-demand                 │
└─────────────────────────────────────┘
```

### Memory Flow

```
Conversation End → Extract decisions → Update hot layer → Compress if needed
                                    → Index to cold layer
                                    
Next Turn → Read hot layer (<500 tokens) → LLM call
         → If needed,检索 cold layer
```

## Scripts

### context-optimizer.js

Core summary engine. Call after each conversation turn.

```javascript
const { ContextOptimizer } = require('./scripts/context-optimizer');
const opt = new ContextOptimizer();

// After conversation
await opt.summarize(messages);

// Get optimized context
const context = opt.getHotContext();

// Export for persistence
const data = opt.export();
```

### agent-memory-helper.js

Agent startup loader. Build hot context from shared files.

```javascript
const { onAgentStartup } = require('./scripts/agent-memory-helper');

// Agent startup - reads PROJECT_STATUS + sidecar
const hotContext = await onAgentStartup('agent-name');
```

### sidecar-updater.js

Persistent sidecar for each agent.

```javascript
const { SidecarUpdater } = require('./scripts/sidecar-updater');
const updater = new SidecarUpdater();

// After agent completes task
await updater.onSessionComplete('agent-name', messages, {
  extractDecisions: true,
  extractTasks: true
});
```

### dual-memory.js

Full hot+cold implementation with vector search.

```javascript
const { DualMemory } = require('./scripts/dual-memory');
const dm = new DualMemory({
  embedder: openAIEmbedder,  // Optional: custom embedder
  vectorStore: chromaDB      // Optional: custom vector store
});

// End of conversation
await dm.onConversationEnd(conversation);

// Get context - auto retrieves from cold if needed
const context = await dm.getContextForLLM();
```

## Reference

See `references/AGENT_MEMORY_ARCHITECTURE.md` for:
- Detailed architecture design
- Token calculation formulas
- Integration patterns
- Implementation roadmap

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| MAX_HOT_TOKENS | 500 | Max tokens in hot layer |
| MAX_SUMMARIES | 3 | Recent summaries to keep |
| MAX_DECISIONS | 20 | Decisions to track |
| SUMMARY_TURNS | 3 | Conversation turns per summary |

## Use Cases

**1. Multi-Agent Coordination**
```javascript
// Main agent: summarize and delegate
await mainOptimizer.summarize(history);
const task = "Research supplier for xxx";
await sessions_send(subAgent, task + "\n\nRead: PROJECT_STATUS.md");

// Sub agent: build context at startup
const context = await onAgentStartup('sub-agent');
```

**2. Long Conversation Memory**
```javascript
// After each turn
await optimizer.summarize(turnMessages);

// Next turn - inject hot context
const enhancedPrompt = hotContext + "\n\n" + newMessage;
```

**3. Decision Tracking**
```javascript
// Decisions extracted automatically
const stats = optimizer.getStats();
console.log(stats.decisionsCount); // Number of decisions tracked
```
