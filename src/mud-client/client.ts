// FULL REAL TELNET - COPY THIS IN
import * as net from 'net';
import { parseMUDOutput } from './parser.js';
import chalk from 'chalk';

export class MUDClient {
  private socket: net.Socket | null = null;
  private connected = false;
  private queue: string[] = [];

  connect(host = 'discworld.starturtle.net', port = 4242) {
    this.socket = net.createConnection({ host, port }, () => {
      this.connected = true;
      console.log(chalk.green('✅ REAL Telnet connected to Discworld MUD'));
      this.socket?.write(Buffer.from([255, 251, 1])); // IAC WILL ECHO
      this.socket?.write('login simulation or auto\n');
    });

    this.socket.on('data', (data) => {
      const raw = data.toString();
      const parsed = parseMUDOutput(raw);
      console.log(chalk.white('📥 REAL MUD:'), parsed);
      // Feed to agent.think + ingestion
    });

    this.socket.on('error', (err) => {
      console.error('Socket error:', err);
      this.reconnect();
    });

    this.socket.on('end', () => this.reconnect());
  }

  sendCommand(cmd: string) {
    this.queue.push(cmd);
    this.socket?.write(cmd + '\n');
    console.log(chalk.yellow('📤 Sent:'), cmd);
  }

  private reconnect() {
    console.log('🔄 Reconnecting...');
    setTimeout(() => this.connect(), 2000);
  }

  disconnect() { this.socket?.end(); }
}

export default MUDClient;