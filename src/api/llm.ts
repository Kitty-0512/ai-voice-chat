// DeepSeek API Key — 去 platform.deepseek.com 获取
// 从环境变量读取，本地开发和线上都安全
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';

// 本地走 Vite 代理，线上走 Vercel 反向代理
const DEEPSEEK_BASE_URL = import.meta.env.DEV
  ? '/deepseek-api/v1'
  : '/api/deepseek/v1';

/**
 * AI 对话流式接口 — DeepSeek
 */
export async function fetchChatStream(
  messages: { role: string; content: string }[],
  onMessage: (content: string) => void
) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `请求失败 (${response.status})`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留不完整的最后一行，下次拼接

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          const content = data.choices?.[0]?.delta?.content;
          if (content) onMessage(content);
        } catch (e) {
          // 忽略碎片解析错误
        }
      }
    }
  }
}