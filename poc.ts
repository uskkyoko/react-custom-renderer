import { WebSocketServer, WebSocket } from 'ws';

const PORT = 9000;

console.log('PoC: React → Flutter IPC Bridge');
console.log(`WebSocket server starting on ws://localhost:${PORT}`);
console.log('Launch your Flutter app now…\n');

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (socket: WebSocket) => {
  console.log(' Flutter connected!\n');

  const createRoot = {
    op: 'create',
    id: 'container-1',
    type: 'container',
    props: { flexDirection: 'column', padding: 20 },
  };
  socket.send(JSON.stringify(createRoot));
  console.log('→ Sent:', JSON.stringify(createRoot));

  const createText = {
    op: 'create',
    id: 'text-1',
    type: 'text',
    props: { text: 'Hello from React!', style: { fontSize: 24 } },
  };
  socket.send(JSON.stringify(createText));
  console.log('→ Sent:', JSON.stringify(createText));

  const appendText = {
    op: 'appendChild',
    parentId: 'container-1',
    childId: 'text-1',
  };
  socket.send(JSON.stringify(appendText));
  console.log('→ Sent:', JSON.stringify(appendText));

  const layoutRoot = {
    op: 'layout',
    id: 'container-1',
    x: 0,
    y: 0,
    w: 800,
    h: 600,
  };
  socket.send(JSON.stringify(layoutRoot));
  console.log('→ Sent:', JSON.stringify(layoutRoot));

  const layoutText = {
    op: 'layout',
    id: 'text-1',
    x: 20,
    y: 20,
    w: 760,
    h: 40,
  };
  socket.send(JSON.stringify(layoutText));
  console.log('→ Sent:', JSON.stringify(layoutText));

  console.log('\nInitial widget tree sent. Waiting for events from Flutter…\n');

  socket.on('close', () => console.log('\nFlutter disconnected.'));
});
