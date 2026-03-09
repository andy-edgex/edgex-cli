import WebSocket from 'ws';
import chalk from 'chalk';
const PING_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECTS = 10;
export class EdgexWebSocket {
    ws = null;
    pingTimer = null;
    reconnectCount = 0;
    closed = false;
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    connect() {
        this.closed = false;
        this.doConnect();
    }
    close() {
        this.closed = true;
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    doConnect() {
        if (this.closed)
            return;
        const wsOpts = {};
        if (this.opts.headers) {
            wsOpts.headers = this.opts.headers;
        }
        this.ws = new WebSocket(this.opts.url, wsOpts);
        this.ws.on('open', () => {
            this.reconnectCount = 0;
            process.stderr.write(chalk.gray('Connected\n'));
            for (const channel of this.opts.channels) {
                this.subscribe(channel);
            }
            this.startPing();
        });
        this.ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                this.handleMessage(msg);
            }
            catch {
                // Ignore unparseable messages
            }
        });
        this.ws.on('error', (err) => {
            if (this.opts.onError) {
                this.opts.onError(err);
            }
        });
        this.ws.on('close', () => {
            this.stopPing();
            if (!this.closed && this.reconnectCount < MAX_RECONNECTS) {
                this.reconnectCount++;
                process.stderr.write(chalk.yellow(`Disconnected, reconnecting (${this.reconnectCount}/${MAX_RECONNECTS})...\n`));
                setTimeout(() => this.doConnect(), RECONNECT_DELAY_MS);
            }
            else if (this.opts.onClose) {
                this.opts.onClose();
            }
        });
    }
    subscribe(channel) {
        this.send({ type: 'subscribe', channel });
    }
    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    handleMessage(msg) {
        const type = msg.type;
        if (type === 'ping') {
            this.send({ type: 'pong', time: msg.time });
            return;
        }
        if (type === 'pong' || type === 'subscribed') {
            return;
        }
        if (type === 'error') {
            const content = msg.content;
            process.stderr.write(chalk.red(`WS error: ${content?.msg ?? JSON.stringify(msg)}\n`));
            return;
        }
        if (type === 'quote-event' || type === 'data') {
            const channel = msg.channel;
            const content = msg.content;
            this.opts.onMessage(channel, content?.data ?? content ?? msg);
            return;
        }
        // Private channel events (account/order/position updates)
        if (type === 'account' || type === 'order' || type === 'position' || msg.channel) {
            const channel = (msg.channel ?? msg.type);
            this.opts.onMessage(channel, msg.content ?? msg.data ?? msg);
            return;
        }
    }
    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            this.send({ type: 'ping', time: String(Date.now()) });
        }, PING_INTERVAL_MS);
    }
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
}
//# sourceMappingURL=ws.js.map