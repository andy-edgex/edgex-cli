import chalk from 'chalk';
import Table from 'cli-table3';
export function printJson(data) {
    console.log(JSON.stringify(data, null, 2));
}
export function printTable(headers, rows) {
    const table = new Table({
        head: headers.map(h => chalk.cyan(h)),
        style: { head: [], border: [] },
    });
    for (const row of rows) {
        table.push(row);
    }
    console.log(table.toString());
}
export function printKeyValue(pairs) {
    const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
    for (const [key, value] of pairs) {
        console.log(`  ${chalk.gray(key.padEnd(maxKeyLen))}  ${value}`);
    }
}
export function formatPrice(value, highlight = false) {
    const s = typeof value === 'number' ? value.toFixed(2) : value;
    return highlight ? chalk.white.bold(s) : s;
}
export function formatPnl(value) {
    const n = parseFloat(value);
    if (isNaN(n) || n === 0)
        return value;
    return n > 0 ? chalk.green(`+${value}`) : chalk.red(value);
}
export function formatPercent(value) {
    const n = parseFloat(value);
    if (isNaN(n) || n === 0)
        return value;
    const pct = (n * 100).toFixed(2) + '%';
    return n > 0 ? chalk.green(`+${pct}`) : chalk.red(pct);
}
export function output(format, jsonData, humanFn) {
    if (format === 'json') {
        printJson(jsonData);
    }
    else {
        humanFn();
    }
}
//# sourceMappingURL=output.js.map