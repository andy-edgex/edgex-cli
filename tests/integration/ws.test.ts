import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { EdgexWebSocket } from '../../src/core/ws.js';

let wss: WebSocketServer;
let port: number;

function waitMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ws.ts — WebSocket integration', () => {
  beforeAll(async () => {
    wss = new WebSocketServer({ port: 0 });
    port = (wss.address() as any).port;
  });

  afterAll(() => {
    wss.close();
  });

  afterEach(() => {
    // Remove all connections
    for (const client of wss.clients) {
      client.close();
    }
  });

  // ─── I-WS-01: Connect and subscribe ───

  it('I-WS-01: connects and sends subscribe messages', async () => {
    const received: string[] = [];

    wss.once('connection', (ws) => {
      ws.on('message', (data) => {
        received.push(data.toString());
      });
    });

    const edgeWs = new EdgexWebSocket({
      url: `ws://localhost:${port}`,
      channels: ['ticker.BTCUSD', 'depth.BTCUSD'],
      onMessage: () => {},
    });

    edgeWs.connect();
    await waitMs(200);

    expect(received.length).toBeGreaterThanOrEqual(2);
    const subs = received.filter(r => {
      try { return JSON.parse(r).type === 'subscribe'; } catch { return false; }
    });
    expect(subs.length).toBe(2);

    edgeWs.close();
  });

  // ─── I-WS-02: Ping → Pong ───

  it('I-WS-02: responds to server ping with pong', async () => {
    const responses: string[] = [];

    wss.once('connection', (ws) => {
      ws.on('message', (data) => {
        responses.push(data.toString());
      });
      // Send ping after a short delay
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'ping', time: '12345' }));
      }, 100);
    });

    const edgeWs = new EdgexWebSocket({
      url: `ws://localhost:${port}`,
      channels: [],
      onMessage: () => {},
    });

    edgeWs.connect();
    await waitMs(300);

    const pongs = responses.filter(r => {
      try { return JSON.parse(r).type === 'pong'; } catch { return false; }
    });
    expect(pongs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(pongs[0]!).time).toBe('12345');

    edgeWs.close();
  });

  // ─── I-WS-03: Quote event routing ───

  it('I-WS-03: routes quote-event to onMessage callback', async () => {
    const messages: { channel: string; data: unknown }[] = [];

    wss.once('connection', (ws) => {
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'quote-event',
          channel: 'ticker.BTCUSD',
          content: { data: { lastPrice: '50000' } },
        }));
      }, 100);
    });

    const edgeWs = new EdgexWebSocket({
      url: `ws://localhost:${port}`,
      channels: [],
      onMessage: (channel, data) => {
        messages.push({ channel, data });
      },
    });

    edgeWs.connect();
    await waitMs(300);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.channel).toBe('ticker.BTCUSD');
    expect((messages[0]!.data as any).lastPrice).toBe('50000');

    edgeWs.close();
  });

  // ─── I-WS-06: Manual close prevents reconnect ───

  it('I-WS-06: close() prevents reconnection', async () => {
    let connectionCount = 0;

    wss.on('connection', () => {
      connectionCount++;
    });

    const edgeWs = new EdgexWebSocket({
      url: `ws://localhost:${port}`,
      channels: [],
      onMessage: () => {},
    });

    edgeWs.connect();
    await waitMs(100);
    edgeWs.close();
    await waitMs(500);

    // Should only have connected once (no reconnect after manual close)
    expect(connectionCount).toBe(1);

    // Clean up listener
    wss.removeAllListeners('connection');
  });
});
