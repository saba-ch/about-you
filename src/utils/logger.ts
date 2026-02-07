export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function formatTime(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;

  const color = LEVEL_COLORS[level];
  const prefix = `${color}${BOLD}[${formatTime()}] ${level.toUpperCase().padEnd(5)}${RESET}`;

  if (args.length > 0) {
    console.error(prefix, message, ...args);
  } else {
    console.error(prefix, message);
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info: (msg: string, ...args: unknown[]) => log('info', msg, ...args),
  warn: (msg: string, ...args: unknown[]) => log('warn', msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),

  progress: (current: number, total: number, label: string) => {
    const pct = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    process.stderr.write(`\r\x1b[36m${bar} ${pct}% ${label}\x1b[0m`);
    if (current === total) process.stderr.write('\n');
  },
};
