// STRUCTURED PARSING - COPY THIS IN
export function parseMUDOutput(output: string) {
  const clean = output.replace(/%[a-zA-Z0-9@]/g, '');
  return {
    clean,
    room: clean.match(/You are in (.*)/)?.[1] || 'Unknown',
    entities: clean.match(/(troll|guard|wizard)/g) || [],
    status: clean.match(/Health: (\\d+)/)?.[1] || '100',
    combat: clean.includes('fight') ? 'active' : 'none'
  };
}

export default parseMUDOutput;