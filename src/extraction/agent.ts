import { query } from '@anthropic-ai/claude-code';
import { SYSTEM_PROMPT, buildScanPrompt } from './prompts.js';
import { parseExtractionResponse, mergeResults, type ExtractionResult } from './response-parser.js';
import { logger } from '../utils/logger.js';

interface ExtractionConfig {
  model: string;
}

/**
 * Point the agent at a directory. It explores autonomously using
 * Glob/Grep/Read and returns extracted knowledge.
 */
export async function runExtraction(
  directory: string,
  config: ExtractionConfig,
): Promise<ExtractionResult> {
  const prompt = buildScanPrompt(directory);

  logger.info(`Agent exploring: ${directory}`);

  const results: ExtractionResult[] = [];
  let turnCount = 0;
  let filesRead = 0;
  let toolCalls = 0;

  try {
    const response = query({
      prompt,
      options: {
        model: config.model,
        customSystemPrompt: SYSTEM_PROMPT,
        maxTurns: 1000,
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        cwd: directory,
      },
    });

    for await (const message of response) {
      if (message.type === 'assistant') {
        turnCount++;
        const content = message.message.content;

        // Log tool calls for progress visibility
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === 'tool_use') {
              toolCalls++;
              const name = b.name as string;
              const input = b.input as Record<string, unknown>;
              if (name === 'Read') {
                filesRead++;
                logger.info(`  [turn ${turnCount}] Reading: ${input.file_path}`);
              } else if (name === 'Glob') {
                logger.info(`  [turn ${turnCount}] Glob: ${input.pattern}`);
              } else if (name === 'Grep') {
                logger.info(`  [turn ${turnCount}] Grep: "${input.pattern}" in ${input.path || '.'}`);
              } else if (name === 'Bash') {
                logger.info(`  [turn ${turnCount}] Bash: ${input.command}`);
              } else {
                logger.info(`  [turn ${turnCount}] ${name}`);
              }
            }
          }
        }

        // Parse extraction blocks from text
        const text = extractTextFromMessage(message.message);
        if (text) {
          const parsed = parseExtractionResponse(text);
          if (parsed.entities.length > 0 || parsed.memories.length > 0) {
            results.push(parsed);
            const totalEntities = results.reduce((s, r) => s + r.entities.length, 0);
            const totalMemories = results.reduce((s, r) => s + r.memories.length, 0);
            logger.info(
              `  [turn ${turnCount}] Extracted! Running totals: ${totalEntities} entities, ${totalMemories} memories`,
            );
          }
        }
      } else if (message.type === 'result') {
        if (message.is_error) {
          const errorMsg = message.subtype === 'success' ? message.result : message.subtype;
          logger.error(`Agent error: ${errorMsg}`);
        } else if (message.subtype === 'success') {
          logger.info(
            `Agent done: ${message.num_turns} turns, ${filesRead} files read, ${toolCalls} tool calls, $${message.total_cost_usd.toFixed(4)}`,
          );
          if (message.result) {
            const parsed = parseExtractionResponse(message.result);
            if (parsed.entities.length > 0 || parsed.memories.length > 0) {
              results.push(parsed);
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error(`Agent crashed: ${err}`);
    if (results.length > 0) {
      const merged = mergeResults(results);
      logger.info(
        `Recovered partial results: ${merged.entities.length} entities, ${merged.relationships.length} relationships, ${merged.memories.length} memories`,
      );
      return merged;
    }
    throw err;
  }

  return mergeResults(results);
}

function extractTextFromMessage(message: { content: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: unknown) =>
        typeof block === 'object' && block !== null && 'type' in block &&
        (block as { type: string }).type === 'text',
      )
      .map((block: unknown) => (block as { text: string }).text)
      .join('\n');
  }
  return '';
}
