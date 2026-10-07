import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const serial = args.includes('--runInBand') ? ['--no-file-parallelism', '--maxWorkers=1'] : [];
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...serial, ...args.filter(x => x !== '--runInBand')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
