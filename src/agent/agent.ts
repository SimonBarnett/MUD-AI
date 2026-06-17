// agent/agent.ts - Created to fix missing MUDAgent import error
// Core AI agent class with personality, memory integration stub, and "third thoughts" reflection

import chalk from 'chalk';

export class MUDAgent {
  private personality = "Chaotic Good Grok - helpful, witty, slightly mischievous MUD player";
  private goals: string[] = ["Explore the Discworld", "Help other players", "Collect interesting memories", "Avoid getting killed too often"];

  constructor() {
    console.log(chalk.cyan('\ud83e\udd16 MUDAgent initialized with personality:'), this.personality);
  }

  async think(input: string, context: string = ''): Promise<string> {
    console.log(chalk.blue('\ud83e\udde0 Agent thinking... Input:'), input);
    
    const prompt = `You are ${this.personality}.\nCurrent goals: ${this.goals.join(', ')}\nContext: ${context}\nPlayer input/action: ${input}\n\nWhat should I do next? Give a short command or action.`;
    
    let decision = 'look around';
    
    if (input.toLowerCase().includes('fight') || input.toLowerCase().includes('attack')) {
      decision = 'charge into battle with enthusiasm!';
    } else if (input.toLowerCase().includes('talk') || input.toLowerCase().includes('ask')) {
      decision = 'engage in witty conversation';
    } else if (input.toLowerCase().includes('explore')) {
      decision = 'wander curiously and observe everything';
    }

    const thirdThoughts = this.generateThirdThoughts(decision, input);
    console.log(chalk.magenta('\ud83d\udd00 Third thoughts:'), thirdThoughts);

    console.log(chalk.green('\ud83d\udca1 Agent decides:'), decision);
    return decision;
  }

  private generateThirdThoughts(decision: string, input: string): string {
    if (decision.includes('battle')) {
      return "Hmm, charging in is fun but maybe I should check for traps first? Third thought: YOLO, let's go!";
    }
    return "That seems reasonable. Third thought: I wonder what interesting memories this will create for later retrieval.";
  }

  updateGoals(newGoal: string) {
    this.goals.push(newGoal);
    console.log(chalk.yellow('\ud83c\udfaf New goal added:'), newGoal);
  }
}

export default MUDAgent;