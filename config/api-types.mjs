import { spawnSync } from 'node:child_process';
const python = process.env.INTRANET_PYTHON || '.venv312/bin/python';
const exported = spawnSync(python, ['config/export_openapi.py'], { stdio: 'inherit' });
if (exported.status) process.exit(exported.status);
const generated = spawnSync(process.execPath, ['node_modules/openapi-typescript/bin/cli.js', 'config/openapi.json', '-o', 'src/typings/generated.ts'], { stdio: 'inherit' });
process.exit(generated.status ?? 1);
