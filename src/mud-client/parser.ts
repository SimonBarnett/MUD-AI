import chalk from 'chalk';

export class MUDParser {
  static parse(line: string) {
    line = line.trim();

    if (line.includes('You are in') || line.includes('Obvious exits')) {
      return { type: 'room', data: line, color: 'cyan' };
    }
    if (line.includes('says:') || line.includes('exclaims:')) {
      return { type: 'speech', data: line, color: 'yellow' };
    }
    if (line.match(/\b(hit|slash|stab|kick|dodge)\b/i)) {
      return { type: 'combat', data: line, color: 'red' };
    }
    if (line.includes('Crivens!')) {
      return { type: 'feegle', data: line, color: 'magenta' };
    }

    // Default rich output
    return {
      type: 'general',
      data: line,
      color: line.length > 60 ? 'blue' : 'white'
    };
  }

  static prettyPrint(line: string) {
    const parsed = this.parse(line);
    // @ts-ignore
    console.log(chalk[parsed.color || 'white'](line));
    return parsed;
  }
}

// Future: Pinkfish colour code support, prompt detection, inventory parsing etc.
