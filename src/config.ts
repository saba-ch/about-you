import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  scan: {
    directories: string[];
    ignore: string[];
  };
  neo4j: {
    uri: string;
    username: string;
    password: string;
  };
  extraction: {
    model: string;
  };
  storage: {
    data_dir: string;
  };
}

function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// Project root — works regardless of cwd
const PROJECT_ROOT = resolve(import.meta.dirname, '..');

export function loadConfig(configPath?: string): Config {
  // Load default config from project root (not cwd)
  const defaultPath = resolve(PROJECT_ROOT, 'config.default.yaml');
  let config: Record<string, unknown> = {};

  if (existsSync(defaultPath)) {
    config = parseYaml(readFileSync(defaultPath, 'utf-8')) as Record<string, unknown>;
  }

  // Merge user config if provided
  if (configPath) {
    const userPath = resolve(configPath);
    if (existsSync(userPath)) {
      const userConfig = parseYaml(readFileSync(userPath, 'utf-8')) as Record<string, unknown>;
      config = deepMerge(config, userConfig);
    }
  }

  // Also check for ~/.aboutyou/config.yaml
  const homeConfig = join(homedir(), '.aboutyou', 'config.yaml');
  if (!configPath && existsSync(homeConfig)) {
    const hc = parseYaml(readFileSync(homeConfig, 'utf-8')) as Record<string, unknown>;
    config = deepMerge(config, hc);
  }

  const typed = config as unknown as Config;

  // Apply env var overrides
  if (process.env.NEO4J_URI) typed.neo4j.uri = process.env.NEO4J_URI;
  if (process.env.NEO4J_USER) typed.neo4j.username = process.env.NEO4J_USER;
  if (process.env.NEO4J_PASSWORD) typed.neo4j.password = process.env.NEO4J_PASSWORD;

  // Expand home directories
  typed.scan.directories = typed.scan.directories.map(expandHome);

  // Resolve data_dir to absolute path (relative to project root, not cwd)
  typed.storage.data_dir = resolve(PROJECT_ROOT, expandHome(typed.storage.data_dir));

  return typed;
}
