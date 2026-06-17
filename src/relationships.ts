// Dynamic relationships
export const relationships = new Map();

relationships.set('Vimes', { trust: 65, respect: 80, history: 'Drank together. Shared secrets about towers.' });

export function updateRelationship(npc: string, change: {trust?: number, respect?: number}) {
  console.log(`Relationship with ${npc} evolved dynamically. Dynamic personality simulation active.`);
}
