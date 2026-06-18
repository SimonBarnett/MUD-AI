// src/mud-client/client.ts - FULL CLEAN + RATE LIMIT + NO DUPLICATE PARSING
import * as net from 'net';
import { parseMUDOutput } from './parser.js';
import chalk from 'chalk';
import { log } from '../logger.js';
import { EventEmitter } from 'events';

export class MUDClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private buffer = '';
  private lastSendTime = 0;
  private autoMode = true;

  connect(host = 'discworld.starturtle.net', port = 4242) {
    log.info(`Connecting to ${host}:${port}...`);
    this.socket = net.createConnection({ host, port }, () => {
      this.connected = true;
      log.success('✅ Connected to Discworld MUD');
      this.socket?.write(Buffer.from([255, 251, 1])); // IAC WILL ECHO
      this.socket?.write('login simulation\n');
    });

    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          const parsed = parseMUDOutput(line);
          this.emit('data', line, parsed); // Pass both raw and parsed once
          log.info('📥 MUD: ' + parsed.clean);
        }
      }
    });

    this.socket.on('error', (err) => {
      log.error('Socket error - recovering: ' + err.message);
      this.reconnect();
    });

    this.socket.on('end', () => {
      log.info('Connection ended - auto reconnecting');
      this.reconnect();
    });
  }

  sendCommand(cmd: string) {
    if (Date.now() - this.lastSendTime < 500) return; // Rate limiting
    this.lastSendTime = Date.now();
    this.socket?.write(cmd + '\n');
    log.success('📤 Sent: ' + cmd);
  }

  private reconnect() {
    setTimeout(() => this.connect(), 3000);
  }

  disconnect() { this.socket?.end(); }

  setAutoMode(mode: boolean) { this.autoMode = mode; }
}

export default MUDClient;