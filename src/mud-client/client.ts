// src/mud-client/client.ts - FULLY ENV-DRIVEN + Achaea ready
import * as net from 'net';
import { parseMUDOutput } from './parser.js';
import { log } from '../logger.js';
import { EventEmitter } from 'events';
import { AgentDecision } from '../agent/agent.js';

export class MUDClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private connected = false;
  private buffer = '';
  private lastSendTime = 0;

  connect(hostOverride?: string, portOverride?: number) {
    // Priority: passed arg > .env > Achaea default (easy switching)
    const host = hostOverride || process.env.MUD_HOST || 'achaea.com';
    const port = portOverride || parseInt(process.env.MUD_PORT || '23', 10);

    log.success(`🔌 Connecting to ${host}:${port}... (reading from .env)`);

    this.socket = net.createConnection({ host, port }, () => {
      this.connected = true;
      log.success(`✅ Connected to ${host} MUD`);
      // Standard telnet options for IRE MUDs (Achaea, Lusternia, etc.)
      this.socket?.write(Buffer.from([255, 251, 1]));   // IAC WILL ECHO
      this.socket?.write(Buffer.from([255, 253, 31]));  // IAC DO NAWS
    });

    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const parsed = parseMUDOutput(line);
          this.emit('data', line, parsed);
          log.info('📥 MUD: ' + parsed.clean.substring(0, 140)); // prevent spam
        }
      }
    });

    this.socket.on('error', (err) => {
      log.error('Socket error - reconnecting: ' + err.message);
      this.reconnect();
    });

    this.socket.on('end', () => {
      log.info('Connection closed - auto-reconnecting...');
      this.reconnect();
    });
  }

  sendCommand(input: string | AgentDecision) {
    if (!this.socket || !this.connected) {
      log.error('Cannot send - not connected');
      return;
    }

    if (Date.now() - this.lastSendTime < 450) return; // rate limit
    this.lastSendTime = Date.now();

    let cmd = '';
    let display = '';

    if (typeof input === 'string') {
      cmd = input;
      display = input || '[enter]';
    } else {
      if (input.action === 'press_enter') {
        cmd = '';
        display = '[⏎ Enter]';
      } else if (input.action === 'send_command' && input.command) {
        cmd = input.command;
        display = input.command;
      } else return;
    }

    this.socket.write(cmd + '\r\n');
    log.success(`✅ Sent: ${display}`);
  }

  private reconnect() {
    setTimeout(() => this.connect(), 3000);
  }

  disconnect() {
    this.socket?.end();
    this.connected = false;
  }
}

export default MUDClient;