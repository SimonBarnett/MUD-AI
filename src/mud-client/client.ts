// src/mud-client/client.ts - FULL CLEAN + RATE LIMIT + STRUCTURED SUPPORT
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
          this.emit('data', line, parsed);
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

  /**
   * Send a command to the MUD.
   * Accepts either a plain string or an AgentDecision object.
   */
  sendCommand(input: string | AgentDecision) {
    if (!this.socket || !this.connected) {
      log.error('Cannot send - not connected');
      return;
    }

    // Rate limiting
    if (Date.now() - this.lastSendTime < 500) return;
    this.lastSendTime = Date.now();

    let commandToSend = '';
    let displayText = '';

    if (typeof input === 'string') {
      commandToSend = input;
      displayText = input || '[press enter]';
    } else {
      // Structured decision from the agent
      if (input.action === 'press_enter') {
        commandToSend = '';
        displayText = '[press enter]';
      } else if (input.action === 'send_command' && input.command) {
        commandToSend = input.command;
        displayText = input.command;
      } else {
        return; // Invalid decision, do nothing
      }
    }

    this.socket.write(commandToSend + '\n');
    log.success('✅ Sent: ' + displayText);
  }

  private reconnect() {
    setTimeout(() => this.connect(), 3000);
  }

  disconnect() {
    this.socket?.end();
  }

  setAutoMode(mode: boolean) {
    this.autoMode = mode;
  }
}

export default MUDClient;