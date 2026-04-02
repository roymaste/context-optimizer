/**
 * Agent Memory Helper - 记忆读取辅助工具
 * 
 * Agent启动时调用，构建热层Context
 */

const fs = require('fs').promises;
const path = require('path');

const PROJECT_STATUS_PATH = '/home/joyandjoe/.openclaw/workspace/knowledge/shared/PROJECT_STATUS.md';
const AGENTS_DIR = '/home/joyandjoe/.openclaw/workspace/knowledge/agents';
const MAX_HOT_CONTEXT = 600;

class AgentMemoryHelper {
  constructor(agentName) {
    this.agentName = agentName;
  }

  /**
   * Agent启动时调用，构建热层Context
   */
  async buildHotContext() {
    const parts = [];
    
    // 1. 读取ProjectStatus（共享层）
    try {
      const projectStatus = await fs.readFile(PROJECT_STATUS_PATH, 'utf-8');
      const statusSummary = this.extractStatusSummary(projectStatus);
      parts.push('## 📋 项目状态\n' + statusSummary);
    } catch (e) {
      console.warn('[Memory] 无法读取PROJECT_STATUS:', e.message);
    }
    
    // 2. 读取自己的sidecar（热层）
    try {
      const sidecarPath = path.join(AGENTS_DIR, this.agentName, 'sidecar.md');
      const sidecar = await fs.readFile(sidecarPath, 'utf-8');
      parts.push('\n\n## 🔥 我的热层\n' + sidecar);
    } catch (e) {
      parts.push('\n\n## 🔥 我的热层\n(暂无记录)');
    }
    
    // 3. 拼接
    const context = parts.join('\n');
    
    // 4. 如果超限，截断
    if (this.countTokens(context) > MAX_HOT_CONTEXT) {
      return this.truncateContext(context, MAX_HOT_CONTEXT);
    }
    
    return context;
  }

  /**
   * 提取ProjectStatus摘要
   */
  extractStatusSummary(content) {
    const lines = content.split('\n');
    const summary = [];
    let inKeySection = false;
    
    for (const line of lines) {
      // 跳过太长或太短的行
      if (line.length > 100 || line.length < 10) continue;
      
      // 跳过代码块
      if (line.startsWith('```')) continue;
      
      // 跳过空行
      if (!line.trim()) continue;
      
      // 保留标题和关键点
      if (line.startsWith('#')) {
        summary.push(line);
      } else if (line.startsWith('- [ ]') || line.startsWith('- [x]')) {
        summary.push(line);
      } else if (line.startsWith('|')) {
        summary.push(line);
      } else if (line.match(/^\*\*.*\*\*:/)) {
        summary.push(line);
      }
      
      // 限制长度
      if (summary.join('\n').length > 2000) break;
    }
    
    return summary.join('\n') || '项目状态获取失败';
  }

  /**
   * 截断Context
   */
  truncateContext(context, maxTokens) {
    const lines = context.split('\n');
    const result = [];
    let currentTokens = 0;
    
    for (const line of lines) {
      const lineTokens = this.countTokens(line);
      if (currentTokens + lineTokens > maxTokens - 100) {
        result.push('\n... (内容已截断)');
        break;
      }
      result.push(line);
      currentTokens += lineTokens;
    }
    
    return result.join('\n');
  }

  /**
   * Token计数
   */
  countTokens(text) {
    if (!text) return 0;
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chinese / 2 + english / 1.3);
  }

  /**
   * 获取Agent的任务历史
   */
  async getTaskHistory() {
    try {
      const historyPath = path.join(AGENTS_DIR, this.agentName, 'history.md');
      const history = await fs.readFile(historyPath, 'utf-8');
      return history;
    } catch (e) {
      return '';
    }
  }
}

/**
 * 快捷函数：Agent启动时调用
 */
async function onAgentStartup(agentName) {
  const helper = new AgentMemoryHelper(agentName);
  const context = await helper.buildHotContext();
  return context;
}

module.exports = { AgentMemoryHelper, onAgentStartup };
