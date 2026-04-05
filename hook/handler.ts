/**
 * Context Optimizer Session Hook
 * 
 * 触发时机：每次收到用户消息时
 * 功能：检查并触发 Context Optimizer 摘要
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const LAST_SUMMARY_FILE = 'memory/.last_summary';
const HOT_LAYER_FILE = 'knowledge/agents/main/sidecar.md';
const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5分钟

async function getLastSummaryTime(workspaceDir: string): Promise<number> {
  try {
    const filePath = path.join(workspaceDir, LAST_SUMMARY_FILE);
    return parseInt(await fs.readFile(filePath, 'utf-8'), 10) || 0;
  } catch {
    return 0;
  }
}

async function updateLastSummaryTime(workspaceDir: string): Promise<void> {
  const filePath = path.join(workspaceDir, LAST_SUMMARY_FILE);
  await fs.writeFile(filePath, Date.now().toString(), 'utf-8');
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {}
}

function buildSummaryContent(messages: any[]): string {
  const lines: string[] = [];
  lines.push(`# 热层摘要\n\n`);
  lines.push(`**更新时间：** ${new Date().toISOString()}\n`);
  lines.push(`**消息数：** ${messages.length}\n\n`);
  lines.push(`## 最近对话\n`);
  
  const recentMessages = messages.slice(-20);
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? '👤' : '🤖';
    const text = typeof msg.content === 'string' ? msg.content : 
      (Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || '').join('') : '');
    if (text && text.length < 300) {
      const preview = text.length > 100 ? text.slice(0, 100) + '...' : text;
      lines.push(`\n${role} ${preview}\n`);
    }
  }
  
  lines.push(`\n## 关键决策\n`);
  lines.push(`- （从对话中提取）\n`);
  
  lines.push(`\n## 待办事项\n`);
  lines.push(`- （从对话中提取）\n`);
  
  return lines.join('');
}

async function getSessionDir(workspaceDir: string): Promise<string> {
  return path.join(workspaceDir, 'sessions');
}

async function getLatestTranscript(sessionDir: string): Promise<{ path: string; time: number } | null> {
  try {
    const files = await fs.readdir(sessionDir);
    const transcripts = files
      .filter(f => f.startsWith('transcript-'))
      .map(f => ({
        name: f,
        path: path.join(sessionDir, f),
        time: fs.stat(path.join(sessionDir, f)).then(s => s.mtimeMs).catch(() => 0)
      }));
    
    if (transcripts.length === 0) return null;
    
    // 按时间排序，最新的在前
    transcripts.sort((a, b) => b.time - a.time);
    const latest = transcripts[0];
    return { path: latest.path, time: await latest.time };
  } catch {
    return null;
  }
}

async function readMessagesFromTranscript(transcriptPath: string): Promise<any[]> {
  try {
    const content = await fs.readFile(transcriptPath, 'utf-8');
    const messages: any[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.message && entry.type === 'message') {
          messages.push(entry.message);
        }
      } catch {}
    }
    return messages;
  } catch {
    return [];
  }
}

const handler = async (event: any) => {
  // 只处理 message:received
  if (event.type !== 'message' || event.action !== 'received') {
    return;
  }

  const workspaceDir = event.context?.workspaceDir || process.env.OPENCLAW_WORKSPACE_DIR;
  if (!workspaceDir) {
    console.log('[context-optimizer-session] No workspace dir');
    return;
  }

  try {
    // 检查间隔
    const lastSummary = await getLastSummaryTime(workspaceDir);
    const now = Date.now();
    
    if (now - lastSummary < MIN_INTERVAL_MS) {
      return; // 跳过，太频繁
    }
    
    // 获取最新transcript
    const sessionDir = await getSessionDir(workspaceDir);
    const latest = await getLatestTranscript(sessionDir);
    
    if (!latest) {
      return;
    }
    
    // 读取消息
    const messages = await readMessagesFromTranscript(latest.path);
    
    if (messages.length === 0) {
      return;
    }
    
    // 生成摘要
    const summaryContent = buildSummaryContent(messages);
    
    // 确保目录存在
    const hotLayerPath = path.join(workspaceDir, HOT_LAYER_FILE);
    await ensureDir(path.dirname(hotLayerPath));
    
    // 写入热层文件
    await fs.writeFile(hotLayerPath, summaryContent, 'utf-8');
    
    // 更新时间戳
    await updateLastSummaryTime(workspaceDir);
    
    console.log(`[context-optimizer-session] Summary updated: ${messages.length} messages`);
  } catch (err) {
    console.error('[context-optimizer-session] Error:', err instanceof Error ? err.message : String(err));
  }
};

export default handler;
