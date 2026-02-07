import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { logger } from '../utils/logger.js';

export async function parseFile(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.pdf':
      return parsePdf(filePath);
    case '.docx':
      return parseDocx(filePath);
    case '.html':
    case '.htm':
      return parseHtml(filePath);
    default:
      return parsePlainText(filePath);
  }
}

async function parsePlainText(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  return content;
}

async function parsePdf(filePath: string): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (err) {
    logger.warn(`Failed to parse PDF ${filePath}: ${err}`);
    return '';
  }
}

async function parseDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const buffer = await readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    logger.warn(`Failed to parse DOCX ${filePath}: ${err}`);
    return '';
  }
}

async function parseHtml(filePath: string): Promise<string> {
  try {
    const TurndownService = (await import('turndown')).default;
    const html = await readFile(filePath, 'utf-8');
    const turndown = new TurndownService();
    return turndown.turndown(html);
  } catch (err) {
    logger.warn(`Failed to parse HTML ${filePath}: ${err}`);
    // Fallback: strip tags
    const html = await readFile(filePath, 'utf-8');
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
