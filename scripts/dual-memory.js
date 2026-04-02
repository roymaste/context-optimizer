/**
 * Dual Memory System - 低Token零失忆实现
 * 
 * 热层：<500tokens的近期摘要
 * 冷层：向量索引，按需检索
 */

const MAX_HOT_TOKENS = 500;
const SUMMARY_TURNS = 3;

class DualMemory {
  constructor(options = {}) {
    this.hotLayer = {
      summaries: [],      // 最近N次摘要
      decisions: [],       // 决策点列表
      tasks: [],          // 当前任务
      lastUpdated: null
    };
    
    this.coldLayer = {
      vectors: [],       // 向量索引
      raw: []            // 原始内容（可选，用于调试）
    };
    
    this.embedder = options.embedder || this.simpleEmbedder;
    this.vectorStore = options.vectorStore || this.inMemoryVectorStore;
    this.tokenCounter = options.tokenCounter || this.approximateTokenCounter;
  }

  /**
   * 对话结束时调用，处理记忆
   */
  async onConversationEnd(conversation) {
    const { messages, decisions, tasks } = conversation;
    
    // 1. 提取决策点 → 热层
    if (decisions && decisions.length > 0) {
      this.hotLayer.decisions.push(...decisions);
      // 保留最近20条
      if (this.hotLayer.decisions.length > 20) {
        this.hotLayer.decisions = this.hotLayer.decisions.slice(-20);
      }
    }
    
    // 2. 提取任务 → 热层
    if (tasks && tasks.length > 0) {
      this.hotLayer.tasks = tasks;
    }
    
    // 3. 生成摘要 → 热层
    const summary = await this.generateSummary(messages);
    this.hotLayer.summaries.push({
      content: summary,
      timestamp: Date.now()
    });
    // 保留最近N条
    if (this.hotLayer.summaries.length > SUMMARY_TURNS) {
      this.hotLayer.summaries = this.hotLayer.summaries.slice(-SUMMARY_TURNS);
    }
    
    // 4. 存向量索引 → 冷层
    await this.addToColdLayer(messages);
    
    // 5. 更新热层token计数
    this.hotLayer.lastUpdated = Date.now();
    
    // 6. 检查热层是否超限，超限则压缩
    await this.checkAndCompressHotLayer();
    
    return {
      hotLayerSize: this.getHotLayerSize(),
      coldLayerSize: this.coldLayer.vectors.length
    };
  }

  /**
   * 获取当前Context构建
   */
  async getContextForLLM() {
    // 热层直接拼接
    const hotContext = this.buildHotLayerContext();
    
    // 如果热层够用，直接返回
    if (this.tokenCounter(hotContext) < MAX_HOT_TOKENS) {
      return hotContext;
    }
    
    // 热层不够用，从冷层检索相关记忆
    const recentTopic = this.hotLayer.summaries.slice(-1)[0]?.content || '';
    const relevantMemories = await this.retrieveFromColdLayer(recentTopic, 3);
    
    return hotContext + '\n\n--- Related Memories ---\n' + relevantMemories.join('\n');
  }

  /**
   * 生成摘要
   */
  async generateSummary(messages) {
    // 简单实现：用最后一条用户消息 + AI回答的要点
    const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const lastAiMsg = messages.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
    
    // 提取关键信息
    const keyPoints = this.extractKeyPoints(messages);
    
    return `[Summary] User asked about: ${lastUserMsg.slice(0, 50)}...
Key outcomes: ${keyPoints.join('; ')}`;
  }

  /**
   * 提取关键点
   */
  extractKeyPoints(messages) {
    const points = [];
    
    // 简单策略：提取包含特定关键词的句子
    const keywords = ['决定', '结论', '完成', '确认', '同意', 'decision', 'conclusion', 'agreed', 'done'];
    
    for (const msg of messages) {
      const content = msg.content || '';
      for (const kw of keywords) {
        if (content.includes(kw)) {
          // 提取这句话
          const sentences = content.split(/[.!?]/);
          for (const s of sentences) {
            if (s.includes(kw)) {
              points.push(s.trim().slice(0, 100));
            }
          }
        }
      }
    }
    
    return [...new Set(points)].slice(0, 5);
  }

  /**
   * 添加到冷层
   */
  async addToColdLayer(messages) {
    const text = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const vector = await this.embedder(text);
    
    this.coldLayer.vectors.push({
      vector,
      text: text.slice(0, 500),  // 只存前500字符作为预览
      fullText: text,
      timestamp: Date.now()
    });
  }

  /**
   * 从冷层检索
   */
  async retrieveFromColdLayer(query, topK = 3) {
    const queryVector = await this.embedder(query);
    
    // 计算相似度
    const scores = this.coldLayer.vectors.map(item => ({
      text: item.text,
      score: this.cosineSimilarity(queryVector, item.vector)
    }));
    
    // 排序取Top-K
    scores.sort((a, b) => b.score - a.score);
    
    return scores.slice(0, topK).map(s => s.text);
  }

  /**
   * 构建热层Context
   */
  buildHotLayerContext() {
    const parts = [];
    
    if (this.hotLayer.summaries.length > 0) {
      parts.push('## Recent Summaries');
      for (const s of this.hotLayer.summaries.slice(-3)) {
        parts.push(`- ${s.content}`);
      }
    }
    
    if (this.hotLayer.decisions.length > 0) {
      parts.push('\n## Decisions');
      for (const d of this.hotLayer.decisions.slice(-10)) {
        parts.push(`- ${d}`);
      }
    }
    
    if (this.hotLayer.tasks.length > 0) {
      parts.push('\n## Current Tasks');
      for (const t of this.hotLayer.tasks) {
        parts.push(`- [ ] ${t}`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * 检查并压缩热层
   */
  async checkAndCompressHotLayer() {
    const size = this.getHotLayerSize();
    if (size > MAX_HOT_TOKENS) {
      // 压缩：只保留最近2条摘要
      this.hotLayer.summaries = this.hotLayer.summaries.slice(-2);
      // 合并决策点为一条
      if (this.hotLayer.decisions.length > 10) {
        const merged = this.hotLayer.decisions.slice(-10).join('; ');
        this.hotLayer.decisions = [merged];
      }
    }
  }

  /**
   * 获取热层大小
   */
  getHotLayerSize() {
    const context = this.buildHotLayerContext();
    return this.tokenCounter(context);
  }

  /**
   * 简单Embedding（生产环境应使用OpenAI/Cohere）
   */
  simpleEmbedder(text) {
    // 简单hash作为占位，生产环境用真实embedding
    const words = text.toLowerCase().split(/\s+/);
    const vec = new Array(128).fill(0);
    for (const word of words) {
      const idx = Math.abs(this.hashCode(word)) % 128;
      vec[idx] += 1;
    }
    // 归一化
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map(v => v / (mag || 1));
  }

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * 内存向量存储（生产环境用ChromaDB）
   */
  inMemoryVectorStore = {
    add: (vec, meta) => {},
    search: (vec, k) => []
  };

  /**
   * 近似Token计数（生产环境用tiktoken）
   */
  approximateTokenCounter(text) {
    // 粗略估算：中文2字符=1token，英文1单词~1.3token
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return Math.ceil(chinese / 2 + english / 1.3);
  }

  /**
   * 余弦相似度
   */
  cosineSimilarity(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }
}

module.exports = { DualMemory, MAX_HOT_TOKENS };
