import { type ExtractedEntity, type ExtractedRelationship, type NodeLabel, VALID_LABELS, VALID_REL_TYPES } from '../storage/schema.js';
import { logger } from '../utils/logger.js';

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  memories: string[];
  summary: string;
}

export function parseExtractionResponse(text: string): ExtractionResult {
  const result: ExtractionResult = {
    entities: [],
    relationships: [],
    memories: [],
    summary: '',
  };

  // Find all <extraction> blocks
  const extractionRegex = /<extraction>([\s\S]*?)<\/extraction>/g;
  let match;

  while ((match = extractionRegex.exec(text)) !== null) {
    const block = match[1];

    // Parse entities
    const entityRegex = /<entity\s+([^>]*)(?:\/>|>([\s\S]*?)<\/entity>)/g;
    let entityMatch;
    while ((entityMatch = entityRegex.exec(block)) !== null) {
      const attrs = parseAttributes(entityMatch[1]);
      const body = entityMatch[2] ?? '';

      const type = attrs.type;
      const name = attrs.name;

      if (!type || !name) continue;

      // Validate label
      if (!VALID_LABELS.has(type as NodeLabel)) {
        logger.debug(`Unknown entity type: ${type}, using as-is`);
      }

      const properties: Record<string, string> = {};
      // Add non-type, non-name attributes as properties
      for (const [key, value] of Object.entries(attrs)) {
        if (key !== 'type' && key !== 'name') {
          properties[key] = value;
        }
      }

      // Parse property children
      const propRegex = /<property\s+key="([^"]*)">([\s\S]*?)<\/property>/g;
      let propMatch;
      while ((propMatch = propRegex.exec(body)) !== null) {
        properties[propMatch[1]] = propMatch[2].trim();
      }

      result.entities.push({
        type: type as NodeLabel,
        name: name.trim(),
        properties,
      });
    }

    // Parse relationships
    const relRegex = /<rel\s+([^>]*)(?:\/>|>([\s\S]*?)<\/rel>)/g;
    let relMatch;
    while ((relMatch = relRegex.exec(block)) !== null) {
      const attrs = parseAttributes(relMatch[1]);
      const body = relMatch[2] ?? '';

      const from = attrs.from;
      const fromType = attrs.from_type;
      const type = attrs.type;
      const to = attrs.to;
      const toType = attrs.to_type;

      if (!from || !fromType || !type || !to || !toType) continue;

      const properties: Record<string, string> = {};
      const propRegex = /<property\s+key="([^"]*)">([\s\S]*?)<\/property>/g;
      let propMatch;
      while ((propMatch = propRegex.exec(body)) !== null) {
        properties[propMatch[1]] = propMatch[2].trim();
      }

      result.relationships.push({
        from: from.trim(),
        fromType: fromType as NodeLabel,
        type: type.trim(),
        to: to.trim(),
        toType: toType as NodeLabel,
        properties,
      });
    }

    // Parse memories
    const memoryRegex = /<memory>([\s\S]*?)<\/memory>/g;
    let memoryMatch;
    while ((memoryMatch = memoryRegex.exec(block)) !== null) {
      const memory = memoryMatch[1].trim();
      if (memory) result.memories.push(memory);
    }

    // Parse summary
    const summaryRegex = /<summary>([\s\S]*?)<\/summary>/;
    const summaryMatch = summaryRegex.exec(block);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }
  }

  return result;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

export function mergeResults(results: ExtractionResult[]): ExtractionResult {
  const merged: ExtractionResult = {
    entities: [],
    relationships: [],
    memories: [],
    summary: '',
  };

  const entityMap = new Map<string, ExtractedEntity>();
  const memorySet = new Set<string>();

  for (const result of results) {
    for (const entity of result.entities) {
      const key = `${entity.type}:${entity.name}`;
      const existing = entityMap.get(key);
      if (existing) {
        // Merge properties
        existing.properties = { ...existing.properties, ...entity.properties };
      } else {
        entityMap.set(key, { ...entity });
      }
    }

    merged.relationships.push(...result.relationships);

    for (const memory of result.memories) {
      if (!memorySet.has(memory)) {
        memorySet.add(memory);
        merged.memories.push(memory);
      }
    }

    if (result.summary && !merged.summary) {
      merged.summary = result.summary;
    }
  }

  merged.entities = Array.from(entityMap.values());
  return merged;
}
