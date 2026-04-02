/**
 * Sidecar Updater - Agent记忆Summary自动更新
 * 
 * 在每次会话结束时自动更新Agent的sidecar文件
 */

const fs = require('fs').promises;
const path = require('path');

const MAX_SIDECAR_TOKENS = 500;
const SIDECAR_DIR = '/home/joyandjoe/.openclaw/workspace/knowledge/agents';

class SidecarUpdater {
  constructor() {
    this.agents = {};
  }

  /**
   * 会话结束时调用
   * @param {string} agentName - Agent名称
   * @param {Array} messages - 对话历史
   * @param {Object} options - 配置
   */
  async onSessionComplete(agentName, messages, options = {}) {
    const {
      extractDecisions = true,
      extractTasks = true,
      summary = null
    } = options;

    // 1. 读取现有sidecar
    const sidecar = await this.readSidecar(agentName);
    
    // 2. 提取内容
    const decisions = extractDecisions ? this.extractDecisions(messages) : [];
    const tasks = extractTasks ? this.extractTasks(messages) : [];
    const summaryText = summary || this.generateSummary(messages);
    
    // 3. 更新sidecar
    if (decisions.length > 0) {
      sidecar.decisions.push(...decisions);
    }
    
    if (tasks.length > 0) {
      sidecar.tasks = tasks; // 任务直接覆盖
    }
    
    if (summaryText) {
      sidecar.summaries.push({
        content: summaryText,
        timestamp: Date.now()
      });
    }
    
    // 4. 压缩（超过限制）
    this.compressIfNeeded(sidecar);
    
    // 5. 写入文件
    await this.writeSidecar(agentName, sidecar);
    
    // 6. 更新ProjectStatus（重大决策时）
    if (decisions.length > 0) {
      await this.maybeUpdateProjectStatus(decisions);
    }
    
    return {
      decisionsAdded: decisions.length,
      tasksUpdated: tasks.length,
      sidecarTokens: this.countTokens(this.formatSidecar(sidecar))
    };
  }

  /**
   * 获取Agent的热层Context
   */
  async getHotContext(agentName) {
    const sidecar = await this.readSidecar(agentName);
    return this.formatSidecar(sidecar);
  }

  /**
   * 读取sidecar
   */
  async readSidecar(agentName) {
    const filePath = path.join(SIDECAR_DIR, agentName, 'sidecar.md');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseSidecar(content);
    } catch (e) {
      // 文件不存在，返回默认
      return {
        summaries: [],
        decisions: [],
        tasks: [],
        facts: [],
        lastUpdated: null
      };
    }
  }

  /**
   * 写入sidecar
   */
  async writeSidecar(agentName, sidecar) {
    const dirPath = path.join(SIDECAR_DIR, agentName);
    await fs.mkdir(dirPath, { recursive: true });
    
    const filePath = path.join(dirPath, 'sidecar.md');
    const content = this.formatSidecar(sidecar);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 解析sidecar文件
   */
  parseSidecar(content) {
    const sections = {
      summaries: [],
      decisions: [],
      tasks: [],
      facts: []
    };
    
    const lines = content.split('\n');
    let currentSection = null;
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        currentSection = line.slice(3).toLowerCase();
      } else if (line.startsWith('- ') && currentSection) {
        sections[currentSection].push(line.slice(2));
      }
    }
    
    return sections;
  }

  /**
   * 格式化sidecar
   */
  formatSidecar(sidecar) {
    const parts = [];
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Taipei' });
    
    parts.push(`# ${now}`);
    
    if (sidecar.summaries.length > 0) {
      parts.push('\n## 最近任务');
      for (const s of sidecar.summaries.slice(-3)) {
        const time = new Date(s.timestamp).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Taipei' });
        parts.push(`- [${time}] ${s.content}`);
      }
    }
    
    if (sidecar.decisions.length > 0) {
      parts.push('\n## 决策点');
      for (const d of sidecar.decisions.slice(-10)) {
        parts.push(`• ${d}`);
      }
    }
    
    if (sidecar.tasks.length > 0) {
      parts.push('\n## 待办');
      for (const t of sidecar.tasks) {
        const done = t.startsWith('[x]') ? '✓' : '□';
        parts.push(`${done} ${t.replace(/^\[.\] /, '')}`);
      }
    }
    
    if (sidecar.facts.length > 0) {
      parts.push('\n## 关键信息');
      for (const f of sidecar.facts.slice(-5)) {
        parts.push(`• ${f}`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * 压缩（超过限制时）
   */
  compressIfNeeded(sidecar) {
    const content = this.formatSidecar(sidecar);
    const tokens = this.countTokens(content);
    
    if (tokens > MAX_SIDECAR_TOKENS) {
      // 保留最新2条摘要
      sidecar.summaries = sidecar.summaries.slice(-2);
      
      // 合并旧决策
      if (sidecar.decisions.length > 5) {
        const recent = sidecar.decisions.slice(-5);
        sidecar.decisions = [...recent.slice(0, 2), `...还有${recent.length - 2}条决策`];
      }
    }
  }

  /**
   * 提取决策点
   */
  extractDecisions(messages) {
    const decisions = [];
    const patterns = [
      /确认|就这样|no problem|agreed|confirmed|好的|对/gi,
      /决定|decided|choose|选这个/gi,
      /不用|不要|no, don't|not|no need/gi
    ];
    
    for (const msg of messages) {
      const content = msg.content || '';
      const sentences = content.split(/[.!?\n]/);
      
      for (const sentence of sentences) {
        for (const pattern of patterns) {
          if (pattern.test(sentence)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 3 && trimmed.length < 200) {
              decisions.push(trimmed);
            }
          }
        }
      }
    }
    
    return [...new Set(decisions)].slice(0, 3);
  }

  /**
   * 提取任务
   */
  extractTasks(messages) {
    const tasks = [];
    
    for (const msg of messages) {
      const content = msg.content || '';
      const matches = content.match(/\[.?\] [^.!\n]+/g);
      if (matches) {
        tasks.push(...matches.map(m => m.trim()));
      }
    }
    
    return [...new Set(tasks)].slice(0, 5);
  }

  /**
   * 生成摘要
   */
  generateSummary(messages) {
    if (!messages || messages.length === 0) return '';
    
    const lastUser = messages.filter(m => m.role === 'user').pop()?.content || '';
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop()?.content || '';
    
    const topic = lastUser.slice(0, 50).replace(/\n/g, ' ');
    const result = lastAssistant.slice(0, 80).replace(/\n/g, ' ');
    
    return `[完成] ${topic}... → ${result}...`;
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
   * 可能更新ProjectStatus（重大决策时）
   */
  async maybeUpdateProjectStatus(decisions) {
    // 如果有重大决策，同步到PROJECT_STATUS.md
    // 简化实现，实际应该写入
    console.log('[Sidecar] 重大决策，可能需要更新PROJECT_STATUS:', decisions);
  }
}

module.exports = { SidecarUpdater, MAX_SIDECAR_TOKENS };
