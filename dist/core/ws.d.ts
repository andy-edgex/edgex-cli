export interface WsOptions {
    url: string;
    channels: string[];
    headers?: Record<string, string>;
    onMessage: (channel: string, data: unknown) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
}
export declare class EdgexWebSocket {
    private ws;
    private pingTimer;
    private reconnectCount;
    private closed;
    private opts;
    constructor(opts: WsOptions);
    connect(): void;
    close(): void;
    private doConnect;
    private subscribe;
    private send;
    private handleMessage;
    private startPing;
    private stopPing;
}
//# sourceMappingURL=ws.d.ts.map