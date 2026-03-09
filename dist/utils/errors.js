import chalk from 'chalk';
export class EdgexError extends Error {
    code;
    statusCode;
    constructor(message, code, statusCode) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'EdgexError';
    }
}
export class ApiError extends EdgexError {
    constructor(code, msg) {
        super(msg, code);
        this.name = 'ApiError';
    }
}
export class ConfigError extends EdgexError {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
    }
}
export function handleError(err, format) {
    let errorMsg = 'An unknown error occurred';
    let errorCode;
    if (err instanceof EdgexError) {
        errorCode = err.code;
        errorMsg = err.message;
    }
    else if (err instanceof Error) {
        errorMsg = err.message;
    }
    if (format === 'json') {
        const errorObj = {
            success: false,
            error: errorMsg,
        };
        if (errorCode) {
            errorObj.code = errorCode;
        }
        console.log(JSON.stringify(errorObj, null, 2));
    }
    else {
        // Human readable output
        if (err instanceof EdgexError) {
            const prefix = err.code ? `[${err.code}] ` : '';
            console.error(chalk.red(`Error: ${prefix}${err.message}`));
        }
        else if (err instanceof Error) {
            console.error(chalk.red(`Error: ${err.message}`));
        }
        else {
            console.error(chalk.red('An unknown error occurred'));
        }
    }
    process.exit(1);
}
//# sourceMappingURL=errors.js.map