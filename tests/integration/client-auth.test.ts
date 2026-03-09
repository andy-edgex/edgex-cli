import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EdgexClient } from '../../src/core/client.js';
import { ConfigError, ApiError } from '../../src/utils/errors.js';

// Mock rate-limiter and proxy before imports resolve
vi.mock('../../src/core/rate-limiter.js', () => ({
  rateLimit: vi.fn().mockResolvedValue(undefined),
  _resetTimestamps: vi.fn(),
}));

vi.mock('../../src/core/proxy.js', () => ({
  getDispatcher: () => undefined,
  setupProxy: () => {},
  getActiveProxy: () => null,
}));

const TEST_PRIV_KEY = '0x060e87cb075c6b1fd0324367d2500244e96ecf05f5369cf5a1165513a0eb4112';

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ code: '0', msg: 'ok', data }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

describe('client.ts — auth integration', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ─── I-AUTH-01: Auth headers present ───

  it('I-AUTH-01: getAccountAsset sends auth headers', async () => {
    const fetchMock = mockFetchOk({ accountId: '123', totalEquity: '1000' });
    globalThis.fetch = fetchMock;

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await client.getAccountAsset();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-edgeX-Api-Timestamp']).toBeTruthy();
    expect(headers['X-edgeX-Api-Signature']).toBeTruthy();
  });

  // ─── I-AUTH-02: Signature length 192 hex ───

  it('I-AUTH-02: signature is 192 hex chars', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await client.getAccountAsset();

    const [, init] = fetchMock.mock.calls[0]!;
    const sig = (init.headers as Record<string, string>)['X-edgeX-Api-Signature'];
    expect(sig).toHaveLength(192);
    expect(sig).toMatch(/^[0-9a-f]{192}$/);
  });

  // ─── I-AUTH-03: POST body contains order fields ───

  it('I-AUTH-03: createOrder sends correct POST body', async () => {
    const fetchMock = mockFetchOk({ orderId: 'test-order-1' });
    globalThis.fetch = fetchMock;

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await client.createOrder({ contractId: '10001', side: 'BUY', type: 'LIMIT', size: '1', price: '50000' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.accountId).toBe('123');
    expect(body.contractId).toBe('10001');
    expect(body.side).toBe('BUY');
  });

  // ─── I-AUTH-04: Multi-ID cancel ───

  it('I-AUTH-04: cancelOrderById sends orderIdList', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await client.cancelOrderById(['id1', 'id2', 'id3']);

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.orderIdList).toEqual(['id1', 'id2', 'id3']);
  });

  // ─── I-AUTH-05: No credentials → ConfigError ───

  it('I-AUTH-05: no credentials throws ConfigError', async () => {
    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
    });

    await expect(client.getAccountAsset()).rejects.toThrow(ConfigError);
    await expect(client.getAccountAsset()).rejects.toThrow('Run "edgex setup"');
  });

  // ─── I-AUTH-06: API error code ───

  it('I-AUTH-06: API error code throws ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: '1001', msg: 'Invalid parameter', data: null }),
      { status: 200 },
    ));

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await expect(client.getAccountAsset()).rejects.toThrow(ApiError);
  });

  // ─── I-AUTH-07: HTTP 500 ───

  it('I-AUTH-07: HTTP 500 throws ApiError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }));

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    await expect(client.getAccountAsset()).rejects.toThrow('500');
  });

  // ─── I-AUTH-08: Network error ───

  it('I-AUTH-08: network error throws ApiError NETWORK', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    try {
      await client.getAccountAsset();
      expect.unreachable();
    } catch (err: any) {
      expect(err.code).toBe('NETWORK');
      expect(err.message).toContain('ECONNREFUSED');
    }
  });

  // ─── I-AUTH-09: GET params sorted ───

  it('I-AUTH-09: GET auth request sorts params alphabetically', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;

    const client = new EdgexClient({
      baseUrl: 'https://test.example.com',
      wsUrl: 'wss://ws.example.com',
      edgeChainRpcUrl: 'https://rpc.example.com',
      accountId: '123',
      starkPrivateKey: TEST_PRIV_KEY,
    });

    // getOrderById passes accountId + orderId as params
    await client.getOrderById('order-456');

    const [url] = fetchMock.mock.calls[0]!;
    const urlStr = typeof url === 'string' ? url : (url as URL).toString();
    // accountId should come before orderId alphabetically
    expect(urlStr).toContain('accountId=123');
    expect(urlStr).toContain('orderId=order-456');
    const accountIdx = urlStr.indexOf('accountId');
    const orderIdx = urlStr.indexOf('orderId');
    expect(accountIdx).toBeLessThan(orderIdx);
  });
});
