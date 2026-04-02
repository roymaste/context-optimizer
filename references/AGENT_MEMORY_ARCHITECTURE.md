# Agent Memory Architecture - 低Token零失忆方案

**版本**：v1.0
**日期**：2026-04-02

---

## 一、问题分析

### 1.1 当前问题

| 问题 | 表现 | 根因 |
|------|------|------|
| Token爆炸 | 多Agent并行，Context重复 | 没有Context隔离 |
| 记忆失忆 | Agent忘记之前说过的话 | 没有热层Summary |
| 记忆不同步 | A记得，B不记得 | 没有共享记忆层 |

### 1.2 当前架构问题

```
主Agent（记忆完整） ← Token巨大
    ↓ sessions_send
子Agent A（独立Session）→ 自己的Context，没有主Agent记忆
子Agent B（独立Session）→ 自己的Context，没有主Agent记忆
```

---

## 二、解决方案：三层记忆架构

```
┌─────────────────────────────────────────┐
│           热层：Agent Sidecar            │ ← <500tokens
│           每个Agent独立的Summary          │
├─────────────────────────────────────────┤
│           共享层：PROJECT_STATUS.md       │ ← 唯一真相源
│           所有Agent启动时必读              │
├─────────────────────────────────────────┤
│           冷层：各Agent独立记忆文件        │ ← 按需读取
│           memory/daily/xxx.md            │
└─────────────────────────────────────────┘
```

---

## 三、Sidecar Summary机制

### 3.1 什么是Sidecar

每个Agent有一个sidecar文件（sidecar.md），记录：
- 最近任务的摘要
- 决策点
- 待办事项
- 关键信息

### 3.2 Sidecar内容格式

```markdown
# Agent Sidecar - [Agent名称]

## 最近任务摘要
- [时间] 任务：xxx，结果：xxx
- [时间] 任务：xxx，结果：xxx

## 决策点
- [日期] xxx决定：xxx

## 待办
- [ ] xxx（负责人）

## 关键信息
- xxx

## Token控制
最后更新：2026-04-02 20:30
热层大小：~300 tokens
```

### 3.3 自动Summary触发

每次Agent完成任务后，自动更新sidecar：
- 提取决策点
- 更新待办
- 生成任务摘要
- 压缩超过500tokens时触发精简

---

## 四、Context隔离方案

### 4.1 主Agent（爪爪）职责

**主Agent = 协调者，不执行具体任务**

```
主Agent收到任务
    ↓
拆分任务
    ↓
派给子Agent（只发送：任务描述 + 共享文档路径）
    ↓
子Agent返回结果
    ↓
主Agent汇总
    ↓
更新PROJECT_STATUS.md + 自己的sidecar
```

### 4.2 子Agent启动流程

```
子Agent启动
    ↓
读取PROJECT_STATUS.md（共享层）
    ↓
读取自己的sidecar.md（热层）
    ↓
执行任务
    ↓
返回结果给主Agent
    ↓
更新自己的sidecar
```

### 4.3 派任务格式（sessions_send）

```json
{
  "task": "具体任务描述",
  "context_files": [
    "/knowledge/shared/PROJECT_STATUS.md"
  ],
  "output_file": "/knowledge/agents/[Agent名]/sidecar.md",
  "summary_required": true
}
```

**关键：不再发送完整的对话历史，而是发送文件路径**

---

## 五、共享记忆层

### 5.1 核心文件：PROJECT_STATUS.md

所有Agent启动时必须读取此文件。

**内容包括：**
- 当前项目状态
- 待办事项
- 决策记录
- 各Agent任务分配

### 5.2 更新规则

| 操作 | 权限 | 方式 |
|------|------|------|
| 写入PROJECT_STATUS | 只有主Agent | sessions_send提议 → 主Agent写入 |
| 读取PROJECT_STATUS | 所有Agent | 启动时读取 |

### 5.3 Agent记忆文件

每个Agent有独立记忆：
```
memory/
  agents/
    [Agent名]/
      sidecar.md      # 热层Summary
      history.md      # 任务历史
```

---

## 六、实现方案

### 6.1 Sidecar更新触发器

在每次sessions_send返回后自动触发：

```javascript
// 伪代码
async function onSessionComplete(sessionKey) {
  // 1. 获取会话摘要
  const summary = await generateSummary(sessionKey);
  
  // 2. 提取决策点
  const decisions = extractDecisions(sessionKey);
  
  // 3. 更新sidecar
  const sidecar = readSidecar(sessionKey);
  sidecar.addSummary(summary);
  sidecar.addDecisions(decisions);
  sidecar.compressIfNeeded(); // >500tokens时压缩
  sidecar.save();
  
  // 4. 如果有重大更新，同步到PROJECT_STATUS
  if (hasMajorUpdate) {
    updateProjectStatus(decisions);
  }
}
```

### 6.2 Agent启动时读取

```javascript
async function agentStartup(agentName) {
  // 1. 读取共享文档
  const projectStatus = readFile('/knowledge/shared/PROJECT_STATUS.md');
  
  // 2. 读取自己的sidecar
  const sidecar = readFile(`/knowledge/agents/${agentName}/sidecar.md`);
  
  // 3. 构建热层Context
  const hotContext = buildHotContext(projectStatus, sidecar);
  
  // 4. 注入到当前Session
  injectContext(hotContext);
}
```

### 6.3 Context压缩策略

当sidecar超过500tokens时：

```markdown
# 原始内容（约800tokens）
## 最近任务
- [今天15:00] 任务A：完成了xx
- [今天14:00] 任务B：完成了yy
- [今天13:00] 任务C：完成了zz

# 压缩后（约300tokens）
## 最近任务
- [今天] 任务A/B/C已完成（详见history.md）
```

---

## 七、Token控制效果

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 子Agent启动 | 读取全部历史 | 只读sidecar <500tokens |
| 派任务 | 发送完整History | 只发任务描述 |
| 记忆同步 | 各Agent独立 | 共享PROJECT_STATUS |
| 总Token消耗 | O(n×history) | O(n×500) |

---

## 八、实施步骤

### Phase 1: Sidecar机制（立即）
- [ ] 创建PROJECT_STATUS.md
- [ ] 每个Agent创建sidecar.md
- [ ] 实现sidecar更新触发器

### Phase 2: Context隔离（1天）
- [ ] 修改sessions_send，不发送History
- [ ] Agent启动时读取共享文档
- [ ] 测试Token消耗

### Phase 3: 自动优化（1周）
- [ ] 实现自动Summary
- [ ] 实现热层压缩
- [ ] 监控Token消耗

---

## 九、待确认事项

1. Sidecar文件路径是否合理？
2. PROJECT_STATUS.md更新流程是否清晰？
3. 派任务格式是否可行？

---

**最后更新**：2026-04-02
