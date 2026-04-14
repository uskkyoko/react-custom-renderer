import React from 'react';
import { startIPCServer } from './ipcBridge.js';
import { render } from './renderer.js';
import HelloWorld from './HelloWorld.js';

const PORT = 9000;

console.log('React → Flutter Custom Renderer');
console.log(`Starting IPC WebSocket server on port ${PORT}…`);
console.log('Waiting for Flutter process to connect…\n');

startIPCServer(PORT);

render(React.createElement(HelloWorld));

console.log('React tree rendered. IPC messages will be sent once Flutter connects.');
