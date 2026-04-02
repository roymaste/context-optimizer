/**
 * Context Optimizer - 对话Summary自动生成器
 * 
 * 在每次对话结束时调用，自动提取：
 * 1. 决策点
 * 2. 待办任务
 * 3. 关键结论
 * 
 * 使用方式：
 * const optimizer = require('./context-optimizer');
 * 
 * // 对话结束时
 * await optimizer.summarize(conversationHistory);
 * 
 * // 获取热层Context（<500tokens）
 * const context = optimizer.getHotContext();
 */

const MAX_HOT_TOKENS = 500;
const MAX_DECISIONS = 20;
const MAX_SUMMARIES = 3;

class ContextOptimizer {
  constructor() {
    this.hotLayer = {
      summaries: [],    // [{content, timestamp, type}]
      decisions: [],    // ['决策1', '决策2']
      tasks: [],       // ['任务1', '任务2']
      facts: []         // ['关键事实1', '关键事实2']
    };
    
    this.version = 1;
  }

  /**
   * 对话结束时调用
   * @param {Array} messages - 对话历史 [{role, content}]
   * @param {Object} options - 可选配置
   */
  async summarize(messages, options = {}) {
    const {
      extractDecisions = true,
      extractTasks = true,
      extractFacts = true
    } = options;

    // 1. 提取决策点
    const extractedDecisions = extractDecisions ? this.extractDecisions(messages) : [];
    if (extractedDecisions.length > 0) {
      this.hotLayer.decisions.push(...extractedDecisions);
      this.hotLayer.decisions = this.hotLayer.decisions.slice(-MAX_DECISIONS);
    }

    // 2. 提取待办任务
    const extractedTasks = extractTasks ? this.extractTasks(messages) : [];
    if (extractedTasks.length > 0) {
      this.hotLayer.tasks = extractedTasks; // 任务直接覆盖，不累积
    }

    // 3. 生成摘要
    const summary = this.generateSummary(messages);
    this.hotLayer.summaries.push({
      content: summary,
      timestamp: Date.now(),
      type: 'conversation'
    });
    this.hotLayer.summaries = this.hotLayer.summaries.slice(-MAX_SUMMARIES);

    // 4. 提取关键事实
    const extractedFacts = extractFacts ? this.extractFacts(messages) : [];
    if (extractedFacts.length > 0) {
      this.hotLayer.facts.push(...extractedFacts);
      this.hotLayer.facts = this.hotLayer.facts.slice(-10);
    }

    return {
      decisionsAdded: extractedDecisions.length,
      tasksAdded: extractedTasks.length,
      summaryGenerated: summary,
      hotLayerSize: this.getTokenCount(this.buildContext())
    };
  }

  /**
   * 获取热层Context（用于LLM调用）
   */
  getHotContext() {
    const context = this.buildContext();
    
    // 如果超限，递归压缩
    if (this.getTokenCount(context) > MAX_HOT_TOKENS) {
      this.compress();
      return this.buildContext();
    }
    
    return context;
  }

  /**
   * 获取热层统计信息
   */
  getStats() {
    const context = this.buildContext();
    return {
      summaryCount: this.hotLayer.summaries.length,
      decisionCount: this.hotLayer.decisions.length,
      taskCount: this.hotLayer.tasks.length,
      factCount: this.hotLayer.facts.length,
      tokenCount: this.getTokenCount(context),
      maxTokens: MAX_HOT_TOKENS,
      compressionRatio: this.getTokenCount(context) / MAX_HOT_TOKENS
    };
  }

  /**
   * 构建Context字符串
   */
  buildContext() {
    const parts = [];
    
    if (this.hotLayer.summaries.length > 0) {
      parts.push('## Recent Conversations\n');
      for (const s of this.hotLayer.summaries.slice(-2)) {
        parts.push(`- ${s.content}`);
      }
    }
    
    if (this.hotLayer.decisions.length > 0) {
      parts.push('\n## Key Decisions\n');
      for (const d of this.hotLayer.decisions.slice(-10)) {
        parts.push(`• ${d}`);
      }
    }
    
    if (this.hotLayer.tasks.length > 0) {
      parts.push('\n## Current Tasks\n');
      for (const t of this.hotLayer.tasks) {
        const done = t.startsWith('[x]') ? '✓' : '□';
        parts.push(`${done} ${t.replace(/^\[.\]/, '')}`);
      }
    }
    
    if (this.hotLayer.facts.length > 0) {
      parts.push('\n## Important Facts\n');
      for (const f of this.hotLayer.facts.slice(-5)) {
        parts.push(`• ${f}`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * 提取决策点
   */
  extractDecisions(messages) {
    const decisions = [];
    const patterns = [
      /(?:决定|确认|同意|就这样|用这个|选这个|noitced|decided|agreed|confirmed|use this)/gi,
      /(?:不是|不要|不用|不能|no, don't|not|no)/gi,
      /(?:是对的|可以|行|好的|好的|no problem|yes|okay)/gi
    ];
    
    for (const msg of messages) {
      const content = msg.content || '';
      const sentences = content.split(/[.!?\n]/);
      
      for (const sentence of sentences) {
        for (const pattern of patterns) {
          if (pattern.test(sentence)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 5 && trimmed.length < 200) {
              decisions.push(trimmed);
            }
          }
        }
      }
    }
    
    // 去重
    return [...new Set(decisions)].slice(0, 5);
  }

  /**
   * 提取待办任务
   */
  extractTasks(messages) {
    const tasks = [];
    const patterns = [
      /\[ \]/g,           // [ ]
      /\[x\]/gi,          // [x]
      /(?:需要|要|应该|得|必须|must|need to|should|have to)/gi
    ];
    
    for (const msg of messages) {
      const content = msg.content || '';
      
      // 提取明确的任务标记
      const matches = content.match(/\[.?\] [^.!\n]+/g);
      if (matches) {
        tasks.push(...matches.map(m => m.trim()));
      }
      
      // 提取"需要做"类句子
      const sentences = content.split(/[.!?\n]/);
      for (const sentence of sentences) {
        for (const pattern of patterns.slice(1)) {
          if (pattern.test(sentence) && /做|执行|完成|处理|处理/g.test(sentence)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 5 && trimmed.length < 150) {
              tasks.push(trimmed);
            }
          }
        }
      }
    }
    
    return [...new Set(tasks)].slice(0, 10);
  }

  /**
   * 提取关键事实
   */
  extractFacts(messages) {
    const facts = [];
    
    // 提取数字、日期、名称等结构化信息
    const patterns = [
      /(?:\d+[\/.-]\d+[\/.-]\d+)/g,           // 日期
      /\$[\d,]+(?:\.\d{2})?/g,               // 金额
      /[\w.-]+@[\w.-]+\.\w+/g,                // 邮箱
      /https?:\/\/[^\s]+/g,                   // URL
    ];
    
    for (const msg of messages) {
      const content = msg.content || '';
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) {
          facts.push(...matches);
        }
      }
    }
    
    return [...new Set(facts)].slice(0, 5);
  }

  /**
   * 生成摘要
   */
  generateSummary(messages) {
    if (messages.length === 0) return '';
    
    const lastUser = messages.filter(m => m.role === 'user').pop()?.content || '';
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop()?.content || '';
    
    // 提取主题词
    const topic = lastUser.slice(0, 80).replace(/\n/g, ' ');
    
    // 提取结果
    let outcome = '';
    if (lastAssistant.length > 0) {
      outcome = lastAssistant.slice(0, 100).replace(/\n/g, ' ');
    }
    
    return `[${new Date().toLocaleDateString()}] Topic: ${topic}... | Result: ${outcome}...`;
  }

  /**
   * 压缩热层
   */
  compress() {
    // 保留最新的
    this.hotLayer.summaries = this.hotLayer.summaries.slice(-1);
    
    // 合并旧决策
    if (this.hotLayer.decisions.length > 5) {
      const recent = this.hotLayer.decisions.slice(-5);
      this.hotLayer.decisions = [...recent.slice(0, 2), `... and ${recent.length - 2} more decisions`];
    }
  }

  /**
   * Token计数（近似）
   */
  getTokenCount(text) {
    if (!text) return 0;
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chinese / 2 + english / 1.3);
  }

  /**
   * 重置（用于新会话）
   */
  reset() {
    this.hotLayer = {
      summaries: [],
      decisions: [],
      tasks: [],
      facts: []
    };
  }

  /**
   * 导出热层数据（用于持久化）
   */
  export() {
    return JSON.stringify({
      version: this.version,
      hotLayer: this.hotLayer,
      exportedAt: Date.now()
    });
  }

  /**
   * 导入热层数据
   */
  import(data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.version === this.version) {
        this.hotLayer = parsed.hotLayer;
      }
    } catch (e) {
      console.error('Failed to import hot layer data:', e);
    }
  }
}

// 使用示例和使用方法注释
/**
 * 使用示例：
 * 
 * const optimizer = new (require('./context-optimizer'))();
 * 
 * // 对话过程中记录
 * const messages = [
 *   {role: 'user', content: '我想做一个电商网站'},
 *   {role: 'assistant', content: '好的，你需要先确定...'},
 *   {role: 'user', content: '决定用Node.js + React'},
 * ];
 * 
 * // 对话结束时
 * await optimizer.summarize(messages);
 * 
 * // 获取热层Context
 * const context = optimizer.getHotContext();
 * console.log('热层Token:', optimizer.getStats().tokenCount);
 * 
 * // 下一轮对话前注入Context
 * const enhancedPrompt = context + '\n\n---\n\n' + newUserMessage;
 */

module.exports = { ContextOptimizer, MAX_HOT_TOKENS };
