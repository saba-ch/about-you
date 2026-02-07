const DEFAULT_CHUNK_SIZE = 500;    // ~500 tokens (rough approximation: 1 token ≈ 4 chars)
const DEFAULT_CHUNK_OVERLAP = 50;
const CHARS_PER_TOKEN = 4;

export interface ChunkOptions {
  chunkSize?: number;      // in tokens
  chunkOverlap?: number;   // in tokens
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const chunkSize = (opts.chunkSize ?? DEFAULT_CHUNK_SIZE) * CHARS_PER_TOKEN;
  const chunkOverlap = (opts.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP) * CHARS_PER_TOKEN;

  if (text.length <= chunkSize) {
    return [text.trim()].filter(c => c.length > 0);
  }

  // Split on paragraph boundaries first
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 > chunkSize && current.length > 0) {
      chunks.push(current.trim());

      // Keep overlap from the end of the current chunk
      if (chunkOverlap > 0 && current.length > chunkOverlap) {
        current = current.slice(-chunkOverlap) + '\n\n' + trimmed;
      } else {
        current = trimmed;
      }
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Handle case where a single paragraph is larger than chunk size
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= chunkSize) {
      result.push(chunk);
    } else {
      // Force split by sentences, then by characters
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let sub = '';
      for (const sentence of sentences) {
        if (sub.length + sentence.length + 1 > chunkSize && sub.length > 0) {
          result.push(sub.trim());
          sub = sentence;
        } else {
          sub = sub ? sub + ' ' + sentence : sentence;
        }
      }
      if (sub.trim()) result.push(sub.trim());
    }
  }

  return result.filter(c => c.length > 0);
}
