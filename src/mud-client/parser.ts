// mud-client/parser.ts - Pinkfish color stripping + basic action detection

export function parseMUDOutput(output: string): string {
  let clean = output.replace(/%[a-zA-Z0-9@]/g, '');
  
  if (clean.includes('You ')) {
    console.log('\ud83d\udcbe Potential memory detected from action');
  }
  
  return clean.trim();
}

export default parseMUDOutput;