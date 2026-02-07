import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

const TABLE_NAME = 'chunks';
const EMBEDDING_DIM = 384;

export interface VectorRecord {
  text: string;
  source_file: string;
  entities?: string[];
  summary?: string;
}

export interface SearchResult {
  text: string;
  source_file: string;
  entities: string[];
  summary: string;
  _distance: number;
}

export class VectorStore {
  private dataDir: string;
  private db: Connection | null = null;
  private table: Table | null = null;
  private embedder: FlagEmbedding | null = null;

  constructor(dataDir: string) {
    this.dataDir = join(dataDir, 'lance_data');
  }

  async init(): Promise<void> {
    this.db = await connect(this.dataDir);
    this.embedder = await FlagEmbedding.init({
      model: EmbeddingModel.AllMiniLML6V2,
    });

    // Check if table exists
    const tables = await this.db.tableNames();
    if (tables.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
    }
    logger.debug('Vector store initialized');
  }

  private async embed(text: string): Promise<number[]> {
    if (!this.embedder) throw new Error('Vector store not initialized');
    const vec = await this.embedder.queryEmbed(text);
    return Array.from(vec);
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embedder) throw new Error('Vector store not initialized');
    const results: number[][] = [];
    for await (const batch of this.embedder.embed(texts)) {
      results.push(...batch.map(v => Array.from(v)));
    }
    return results;
  }

  async add(record: VectorRecord): Promise<void> {
    if (!this.db) throw new Error('Vector store not initialized');

    const vector = await this.embed(record.text);

    const row = {
      id: randomUUID(),
      text: record.text,
      vector,
      source_file: record.source_file,
      file_type: getFileType(record.source_file),
      created_at: new Date().toISOString(),
      entities: (record.entities ?? []).join(','),
      summary: record.summary ?? '',
    };

    if (!this.table) {
      this.table = await this.db.createTable(TABLE_NAME, [row]);
      logger.debug('Created vector table');
    } else {
      await this.table.add([row]);
    }
  }

  async addBatch(records: VectorRecord[]): Promise<void> {
    if (!this.db || records.length === 0) return;

    const texts = records.map(r => r.text);
    const vectors = await this.embedBatch(texts);

    const rows = records.map((record, i) => ({
      id: randomUUID(),
      text: record.text,
      vector: vectors[i],
      source_file: record.source_file,
      file_type: getFileType(record.source_file),
      created_at: new Date().toISOString(),
      entities: (record.entities ?? []).join(','),
      summary: record.summary ?? '',
    }));

    if (!this.table) {
      this.table = await this.db.createTable(TABLE_NAME, rows);
      logger.debug('Created vector table');
    } else {
      await this.table.add(rows);
    }
  }

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    if (!this.table) return [];

    const queryVector = await this.embed(query);

    const results = await this.table
      .query()
      .nearestTo(queryVector)
      .select(['text', 'source_file', 'entities', 'summary'])
      .limit(limit)
      .toArray();

    return results.map(r => ({
      text: r.text,
      source_file: r.source_file,
      entities: r.entities ? r.entities.split(',').filter(Boolean) : [],
      summary: r.summary,
      _distance: r._distance ?? 0,
    }));
  }

  async count(): Promise<number> {
    if (!this.table) return 0;
    return this.table.countRows();
  }
}

function getFileType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const typeMap: Record<string, string> = {
    md: 'markdown',
    txt: 'text',
    pdf: 'pdf',
    docx: 'docx',
    html: 'html',
    htm: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    csv: 'csv',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
  };
  return typeMap[ext] ?? 'text';
}
