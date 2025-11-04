import { DurableObject } from "cloudflare:workers";

export class RoomDO extends DurableObject {
private sockets: Map<WebSocket, { [key: string]: string }>

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sockets = new Map(); // id -> websocket

    this.ctx.getWebSockets().forEach(ws => {
        let attachment = ws.deserializeAttachment()
        if (attachment) {
            this.sockets.set(ws, {...attachment})
        }
    })

    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server)

    const clientId = crypto.randomUUID();
    server.serializeAttachment({ id: clientId})

    this.sockets.set(server, { id: clientId })

    this.handleConnection(server, clientId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleConnection(ws: WebSocket, clientId: string) {
    ws.send(JSON.stringify({
      type: "welcome",
      id: clientId,
      peers: [...this.sockets.values().map(i => i.id)].filter(i => i !== clientId),
    }));

    // Notify other peers
    this.broadcast({ type: "peer-join", id: clientId }, clientId);
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    let msg: {type: string, to?: string};
    if (typeof message === 'string')
    try {msg = JSON.parse(message)} catch {return;}
    else
    try {msg = JSON.parse(String.fromCharCode(...new Uint8Array(message)))} catch {return;}
    if (msg.type === 'signal' && msg.to) {
      const target = this.sockets.entries().find(([ws, i]) => i.id === msg.to)?.[0]
      if (target) target.send(message)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const attachment = this.sockets.get(ws)
    if (attachment) {
    this.sockets.delete(ws)
    this.broadcast({type: "peer-leave", id: attachment.clientId}, attachment.clientId)
    }
  }

  broadcast(obj: any, clientId: string) {
    const msg = JSON.stringify(obj);
    for (const [sock, attachment] of this.sockets) {
      if (attachment.id !== clientId) {
        try { sock.send(msg); } catch {}
      }
    }
  }

  // --- Hibernation API hooks ---

  // Cloudflare calls this to persist open sockets while sleeping

  // Required to allow the DO to hibernate when idle
  async webSocketDurableObject() {
    return { acceptsWebSocket: true };
  }
}
