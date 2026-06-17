// Smarter Pinkfish-aware parser
export function parseMUDOutput(output: string) {
  // Strip Pinkfish colours
  const clean = output.replace(/%[a-zA-Z0-9@]/g, '');
  
  console.log('🎨 Pinkfish colours stripped and parsed');
  
  if (clean.includes('You ')) {
    // Store as episodic memory
    // storeMemory(...)
  }
  return clean;
}
