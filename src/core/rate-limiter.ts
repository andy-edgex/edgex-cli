import chalk from 'chalk';

const WINDOW_MS = 10_000;
const MAX_REQUESTS = 50;

const timestamps: number[] = [];

function pruneOld(now: number): void {
  while (timestamps.length > 0 && timestamps[0]! < now - WINDOW_MS) {
    timestamps.shift();
  }
}

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  pruneOld(now);

  if (timestamps.length >= MAX_REQUESTS) {
    const oldest = timestamps[0]!;
    const waitMs = oldest + WINDOW_MS - now + 50;
    if (waitMs > 0) {
      process.stderr.write(chalk.yellow(`Rate limited, waiting ${Math.ceil(waitMs / 1000)}s...\n`));
      await new Promise(resolve => setTimeout(resolve, waitMs));
      pruneOld(Date.now());
    }
  }

  timestamps.push(Date.now());
}

// Test-only export
export function _resetTimestamps() { timestamps.length = 0; }
