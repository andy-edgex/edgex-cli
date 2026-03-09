import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', '..', 'dist', 'index.js');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runCli(args: string[], env?: Record<string, string>): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile('node', [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      timeout: 10_000,
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: error ? (error as any).code ?? 1 : 0,
      });
    });
  });
}
