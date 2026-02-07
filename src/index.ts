#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from './config.js';
import { logger, setLogLevel } from './utils/logger.js';

const program = new Command();

program
  .name('about-you')
  .description('Personal knowledge system — scans your files, builds a knowledge graph, exposes it via MCP')
  .version('0.1.0')
  .option('-c, --config <path>', 'path to config YAML file')
  .option('-v, --verbose', 'enable debug logging');

program
  .command('scan')
  .description('Scan directories and extract knowledge')
  .argument('[directories...]', 'directories to scan (overrides config)')
  .option('--dry-run', 'list directories that would be scanned')
  .action(async (directories: string[], opts: { dryRun?: boolean }) => {
    const config = loadConfig(program.opts().config);
    if (program.opts().verbose) setLogLevel('debug');

    if (directories.length > 0) {
      config.scan.directories = directories;
    }

    const { runScan } = await import('./commands/scan.js');
    await runScan(config, { dryRun: opts.dryRun ?? false });
  });

program
  .command('serve')
  .description('Start the MCP server (stdio transport)')
  .action(async () => {
    const config = loadConfig(program.opts().config);
    if (program.opts().verbose) setLogLevel('debug');

    const { runServe } = await import('./commands/serve.js');
    await runServe(config);
  });

program
  .command('status')
  .description('Show scan stats, entity counts, and last scan time')
  .action(async () => {
    const config = loadConfig(program.opts().config);
    if (program.opts().verbose) setLogLevel('debug');

    const { runStatus } = await import('./commands/status.js');
    await runStatus(config);
  });

program
  .command('reset')
  .description('Clear all stored data (graph + vectors + scan state)')
  .option('--yes', 'skip confirmation prompt')
  .action(async (opts: { yes?: boolean }) => {
    const config = loadConfig(program.opts().config);

    const { runReset } = await import('./commands/reset.js');
    await runReset(config, { yes: opts.yes ?? false });
  });

program.parse();
