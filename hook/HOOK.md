---
name: context-optimizer-session
description: "Context Optimizer - triggers on every user message"
homepage: https://github.com/roymaste/context-optimizer
metadata:
  {
    "openclaw": {
      "emoji": "🧠",
      "events": ["message:received"],
      "requires": { "config": ["workspace.dir"] },
      "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with context-optimizer" }]
    }
  }
---

# Context Optimizer Session Hook

触发时机：每次收到用户消息时

## 功能

1. 检查距离上次摘要是否超过5分钟（避免频繁触发）
2. 如果超过，读取当前会话历史
3. 调用summarize()
4. 更新热层文件

## 状态文件

- `~/.openclaw/workspace/memory/.last_summary` - 记录上次摘要时间戳
