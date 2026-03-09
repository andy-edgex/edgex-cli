import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const TESTS_DIR = join(REPO_ROOT, 'tests/v2_regression');
// ── TAP Parser ──
function parseTapOutput(tap) {
    const cases = [];
    for (const line of tap.split('\n')) {
        const okMatch = line.match(/^ok\s+(\d+)\s+-\s+(.*)/);
        if (okMatch) {
            const desc = okMatch[2];
            const skipMatch = desc.match(/^#\s*SKIP\s+(.*)/i);
            if (skipMatch) {
                cases.push({ id: extractId(skipMatch[1]) || `CASE-${okMatch[1]}`, name: skipMatch[1].trim(), status: 'skip' });
            }
            else {
                cases.push({ id: extractId(desc) || `CASE-${okMatch[1]}`, name: desc.trim(), status: 'pass' });
            }
            continue;
        }
        const failMatch = line.match(/^not ok\s+(\d+)\s+-\s+(.*)/);
        if (failMatch) {
            cases.push({ id: extractId(failMatch[2]) || `CASE-${failMatch[1]}`, name: failMatch[2].trim(), status: 'fail' });
            continue;
        }
        // Capture failure message from TAP diagnostic
        if (line.match(/^\s+message:/) && cases.length > 0) {
            const msg = line.replace(/^\s+message:\s*/, '').trim();
            cases[cases.length - 1].message = msg;
        }
    }
    return cases;
}
function extractId(desc) {
    const m = desc.match(/(TC-[A-Z]+-\d+[a-z]?)/);
    return m ? m[1] : '';
}
// ── Suite Discovery ──
async function getAvailableSuites() {
    try {
        const files = await readdir(TESTS_DIR);
        return files
            .filter(f => f.startsWith('tc_') && f.endsWith('.sh'))
            .map(f => f.replace('.sh', ''))
            .sort();
    }
    catch {
        return [];
    }
}
async function getSuiteCases(suite) {
    const filePath = join(TESTS_DIR, `${suite}.sh`);
    try {
        const content = await readFile(filePath, 'utf-8');
        const planMatch = content.match(/tap_plan\s+(\d+)/);
        const plan = planMatch ? parseInt(planMatch[1], 10) : 0;
        const caseNames = [];
        const casePattern = /^echo\s+"#\s+(TC-[A-Z]+-\d+):\s+(.+)"/gm;
        let m;
        while ((m = casePattern.exec(content)) !== null) {
            caseNames.push(`${m[1]}: ${m[2]}`);
        }
        return { plan, caseNames };
    }
    catch {
        return { plan: 0, caseNames: [] };
    }
}
// ── .env Loader ──
async function loadDotEnv() {
    const envFile = join(REPO_ROOT, '.env');
    const vars = {};
    try {
        const content = await readFile(envFile, 'utf-8');
        for (const raw of content.split('\n')) {
            const line = raw.replace(/#.*/, '').trim();
            if (!line)
                continue;
            let key, val;
            if (line.includes('=')) {
                const idx = line.indexOf('=');
                key = line.slice(0, idx).trim();
                val = line.slice(idx + 1).trim();
            }
            else if (line.includes(':')) {
                const idx = line.indexOf(':');
                key = line.slice(0, idx).trim().replace(/\s+/g, '_').toUpperCase();
                val = line.slice(idx + 1).trim();
            }
            else {
                continue;
            }
            // Normalize key: trim, collapse spaces → underscore, uppercase
            const normKey = key.replace(/\s+/g, '_').toUpperCase();
            // Map known keys to env vars
            switch (normKey) {
                case 'L2PRIAVTEKEY':
                case 'L2PRIVATEKEY':
                case 'L2_PRIVATE_KEY':
                    vars.EDGEX_STARK_PRIVATE_KEY = val.startsWith('0x') ? val : `0x${val}`;
                    break;
                case 'ACCOUNT_ID':
                    vars.EDGEX_ACCOUNT_ID = val;
                    break;
                case 'SUB_ACCOUNT_ID':
                    vars.SUB_ACCOUNT_ID = val;
                    break;
                case 'SUB_STARK_PRIVATE_KEY':
                    vars.SUB_STARK_PRIVATE_KEY = val;
                    break;
                case 'ETH_ADDRESS':
                    vars.ETH_ADDRESS = val;
                    break;
            }
        }
    }
    catch {
        // No .env file
    }
    return vars;
}
// ── Runner ──
function runSuite(suite, env, extraEnv = {}) {
    return new Promise((resolve) => {
        const suiteFile = join(TESTS_DIR, `${suite}.sh`);
        const startTime = Date.now();
        const envVars = {
            ...process.env,
            ...extraEnv,
            CLI_PATH: join(REPO_ROOT, 'dist/index.js'),
        };
        if (env === 'testnet') {
            envVars.EDGEX_TESTNET = '1';
        }
        const child = spawn('bash', [suiteFile], {
            env: envVars,
            cwd: TESTS_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
            resolve({
                output: stdout,
                exitCode: code ?? 1,
                duration_ms: Date.now() - startTime,
            });
        });
        child.on('error', () => {
            resolve({
                output: stdout,
                exitCode: 1,
                duration_ms: Date.now() - startTime,
            });
        });
    });
}
// ── Command Registration ──
export function registerTestCommand(program) {
    const test = program
        .command('test')
        .description('Regression test runner');
    // edgex test list [suite]
    test
        .command('list [suite]')
        .description('List available test suites, or cases within a suite')
        .action(async (suite) => {
        const isJson = program.opts().json;
        if (suite) {
            const { plan, caseNames } = await getSuiteCases(suite);
            if (isJson) {
                console.log(JSON.stringify({ suite, plan, cases: caseNames }));
            }
            else {
                console.log(chalk.bold(`${suite}`) + chalk.gray(` (${plan} assertions)`));
                for (const c of caseNames) {
                    console.log(`  ${c}`);
                }
                if (caseNames.length === 0) {
                    console.log(chalk.gray('  No cases found (or file does not exist)'));
                }
            }
            return;
        }
        const suites = await getAvailableSuites();
        if (isJson) {
            const details = await Promise.all(suites.map(async (s) => {
                const { plan, caseNames } = await getSuiteCases(s);
                return { name: s, plan, caseCount: caseNames.length };
            }));
            console.log(JSON.stringify({ suites: details }));
        }
        else {
            console.log(chalk.bold('Available test suites:'));
            for (const s of suites) {
                const { plan, caseNames } = await getSuiteCases(s);
                console.log(`  ${chalk.cyan(s)}  ${chalk.gray(`${caseNames.length} cases, ${plan} assertions`)}`);
            }
        }
    });
    // edgex test run <suites...>
    test
        .command('run [suites...]')
        .description('Run regression test suites (default: tc_acc tc_trd tc_api tc_sub)')
        .option('--case <id>', 'Run only a specific case (not yet implemented)')
        .action(async (suites, opts) => {
        const isJson = program.opts().json;
        const isTestnet = program.opts().testnet;
        const env = isTestnet ? 'testnet' : 'mainnet';
        // Load .env for credentials
        const dotEnv = await loadDotEnv();
        // Resolve suite list
        const available = await getAvailableSuites();
        let toRun;
        if (suites.length === 0) {
            toRun = ['tc_acc', 'tc_trd', 'tc_api', 'tc_sub'];
        }
        else if (suites.length === 1 && suites[0] === 'all') {
            toRun = available;
        }
        else {
            toRun = suites;
        }
        // Validate
        for (const s of toRun) {
            if (!available.includes(s)) {
                if (isJson) {
                    console.log(JSON.stringify({ error: `Suite not found: ${s}`, available }));
                }
                else {
                    console.error(chalk.red(`Suite not found: ${s}`));
                    console.error(`Available: ${available.join(', ')}`);
                }
                process.exit(1);
            }
        }
        if (!isJson) {
            console.log(chalk.bold('EdgeX Regression Test Runner'));
            console.log(chalk.gray(`env: ${env} | suites: ${toRun.join(', ')}`));
            console.log('');
        }
        const result = {
            env,
            timestamp: new Date().toISOString(),
            suites: [],
            summary: { total: 0, pass: 0, fail: 0, skip: 0 },
        };
        for (const suite of toRun) {
            if (!isJson) {
                process.stdout.write(`${chalk.cyan('▶')} Running ${chalk.bold(suite)} ...`);
            }
            const { output, exitCode, duration_ms } = await runSuite(suite, env, dotEnv);
            const cases = parseTapOutput(output);
            const suiteResult = {
                name: suite,
                total: cases.length,
                pass: cases.filter(c => c.status === 'pass').length,
                fail: cases.filter(c => c.status === 'fail').length,
                skip: cases.filter(c => c.status === 'skip').length,
                duration_ms,
                cases,
            };
            result.suites.push(suiteResult);
            result.summary.total += suiteResult.total;
            result.summary.pass += suiteResult.pass;
            result.summary.fail += suiteResult.fail;
            result.summary.skip += suiteResult.skip;
            if (!isJson) {
                if (suiteResult.fail === 0) {
                    console.log(` ${chalk.green('✓')} ${suiteResult.pass}/${suiteResult.total} passed ${chalk.gray(`(${duration_ms}ms)`)}`);
                }
                else {
                    console.log(` ${chalk.red('✗')} ${suiteResult.pass}/${suiteResult.total} passed, ${chalk.red(`${suiteResult.fail} failed`)} ${chalk.gray(`(${duration_ms}ms)`)}`);
                    for (const c of cases.filter(c => c.status === 'fail')) {
                        console.log(`    ${chalk.red('✗')} ${c.id}: ${c.name}${c.message ? chalk.gray(` — ${c.message}`) : ''}`);
                    }
                }
            }
        }
        if (isJson) {
            console.log(JSON.stringify(result));
        }
        else {
            console.log('');
            const { total, pass, fail } = result.summary;
            if (fail === 0) {
                console.log(chalk.green.bold(`✓ All ${total} tests passed`));
            }
            else {
                console.log(chalk.red.bold(`✗ ${fail}/${total} tests failed`));
            }
        }
        process.exit(result.summary.fail > 0 ? 1 : 0);
    });
}
//# sourceMappingURL=test.js.map