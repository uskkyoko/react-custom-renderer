import { WebSocketServer, WebSocket } from 'ws';
import type { ProtocolMessage, IncomingEvent } from './types.js';

let wss: WebSocketServer | null = null;
let activeSocket: WebSocket | null = null;
const eventListeners = new Map<string, Array<(msg: IncomingEvent) => void>>();
const messageQueue: ProtocolMessage[] = [];

export function startIPCServer(port = 9000): void {
  wss = new WebSocketServer({ port });
  console.log(`[IPC] WebSocket server listening on ws://localhost:${port}`);

  wss.on('connection', (socket) => {
    activeSocket = socket;
    console.log('[IPC] Flutter process connected');

    if (messageQueue.length > 0) {
      console.log(`[IPC] Flushing ${messageQueue.length} queued message(s)…`);
      for (const msg of messageQueue) {
        socket.send(JSON.stringify(msg));
      }
      messageQueue.length = 0;
    }

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as IncomingEvent;
        handleIncomingEvent(msg);
      } catch (e) {
        console.error('[IPC] Bad message from Flutter:', (e as Error).message);
      }
    });

    socket.on('close', () => {
      console.log('[IPC] Flutter process disconnected');
      activeSocket = null;
    });
  });
}

export function sendMessage(message: ProtocolMessage): void {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    messageQueue.push(message);
    return;
  }
  activeSocket.send(JSON.stringify(message));
}

function handleIncomingEvent(msg: IncomingEvent): void {
  if (!msg.event || !msg.targetId) return;
  const listeners = eventListeners.get(msg.targetId) ?? [];
  for (const cb of listeners) cb(msg);
}

export function registerEventListener(
  id: string,
  callback: (msg: IncomingEvent) => void,
): void {
  if (!eventListeners.has(id)) eventListeners.set(id, []);
  eventListeners.get(id)!.push(callback);
}

export function removeEventListeners(id: string): void {
  eventListeners.delete(id);
}

export function closeIPCServer(): void {
  wss?.close();
}
