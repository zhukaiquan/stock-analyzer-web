import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

let cachedSystemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  const skillPath = path.join(process.cwd(), '..', 'stock-value-analyzer', 'SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');

  const referencesDir = path.join(process.cwd(), '..', 'stock-value-analyzer', 'references');
  let references = '';

  try {
    const files = fs.readdirSync(referencesDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(referencesDir, file), 'utf-8');
      references += `\n\n--- ${file} ---\n${content}`;
    }
  } catch {
    // References directory may not exist
  }

  cachedSystemPrompt = skillContent + references;
  return cachedSystemPrompt;
}

function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEEPSEEK_API_KEY 环境变量未设置。请在 stock-analyzer-web/.env.local 中配置：\n' +
      '  DEEPSEEK_API_KEY=your_api_key_here'
    );
  }

  return new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey,
  });
}

export async function claudeAnalyze(
  symbol: string,
  market: string,
  fetchedData: Record<string, unknown>
): Promise<AsyncIterable<string>> {
  const client = getClient();

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 16000,
    stream: true,
    messages: [
      {
        role: 'system',
        content: getSystemPrompt()
      },
      {
        role: 'user',
        content: `请对 ${symbol}（${market}市场）执行完整的价值分析。

以下是 API 取数结果（Step 0.0 已完成）：
\`\`\`json
${JSON.stringify(fetchedData, null, 2)}
\`\`\`

请从 Step 0.5（近 30 天事件扫描）开始，完成 Step 1-7 的全部分析，输出完整的分析报告。
报告必须包含所有必需章节和附录。`
      }
    ],
  });

  return (async function*() {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  })();
}

export async function claudeAnalyzeSync(
  symbol: string,
  market: string,
  fetchedData: Record<string, unknown>
): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 16000,
    messages: [
      {
        role: 'system',
        content: getSystemPrompt()
      },
      {
        role: 'user',
        content: `请对 ${symbol}（${market}市场）执行完整的价值分析。

以下是 API 取数结果（Step 0.0 已完成）：
\`\`\`json
${JSON.stringify(fetchedData, null, 2)}
\`\`\`

请从 Step 0.5（近 30 天事件扫描）开始，完成 Step 1-7 的全部分析，输出完整的分析报告。
报告必须包含所有必需章节和附录。`
      }
    ],
  });

  return response.choices[0]?.message?.content || '';
}
