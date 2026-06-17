// mud-client/client.ts - Created to fix missing MUDClient import
// Basic Telnet client stub with connect, send, and output handling
// In full version: use 'net' or 'telnet-client' package for real Discworld MUD connection

import { parseMUDOutput } from './parser.js';
import chalk from 'chalk';

export class MUDClient {
  private connected = false;

  constructor() {
    console.log(chalk.gray('\ud83d\udce1 MUDClient initialized (stub mode - real Telnet coming soon)'));
  }

  connect(host = 'discworld.starturtle.net', port = 4242) {
    console.log(chalk.blue(`\ud83d\udce1 Connecting to MUD at ${host}:${port}...`));
    
    this.connected = true;
    console.log(chalk.green('\u2705 Connected to Discworld MUD (simulated)'));
    
    const initialOutput = '%RYou stand in the bustling streets of Ankh-Morpork.%rType %Yhelp%r for assistance.';
    this.handleOutput(initialOutput);
    
    return true;
  }

  sendCommand(command: string) {
    if (!this.connected) {
      console.log(chalk.red('\u274c Not connected to MUD!'));
      return;
    }
    console.log(chalk.yellow('\ud83d\udce4 Sending to MUD:'), command);
    
    setTimeout(() => {
      const simulatedResponse = `You ${command.toLowerCase()}. Interesting things happen.`;
      this.handleOutput(simulatedResponse);
    }, 300);
  }

  private handleOutput(rawOutput: string) {
    const cleaned = parseMUDOutput(rawOutput);
    console.log(chalk.white('\ud83d\udce5 MUD says:'), cleaned);
  }

  disconnect() {
    this.connected = false;
    console.log(chalk.gray('\ud83d\udc4b Disconnected from MUD'));
  }

  isConnected() {
    return this.connected;
  }
}

export default MUDClient;