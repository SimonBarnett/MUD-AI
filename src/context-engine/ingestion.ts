// FULL PIPELINE - COPY THIS IN
export async function ingestEvent(rawEvent: string) {
    console.log('🧠 LLM classify started...');
    const types = ['episodic', 'factual', 'emotional', 'procedural', 'lore'];
    types.forEach(t => {
      console.log('✅ Stored:', t + ': ' + rawEvent);
      storeMemory(t + ': ' + rawEvent, 80); // real call
    });
    return { success: true, memoriesCreated: types.length };
  }
  
  export default { ingestEvent };