export type SseBlock = {
  event: string;
  data: unknown;
};

export function parseSseBlock(block: string): SseBlock | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (block: SseBlock) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<{ receivedDone: boolean }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator !== -1) {
        const raw = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const parsed = parseSseBlock(raw);
        if (parsed) {
          if (parsed.event === 'done') receivedDone = true;
          await onEvent(parsed);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        separator = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { receivedDone };
}
