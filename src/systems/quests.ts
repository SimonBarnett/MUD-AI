export const quests = [
  { id: 'watchtowers', name: 'Investigate the New Watchtowers', progress: 65, reward: 'Guild favour + lore' },
  { id: 'trading', name: 'Become a master trader on the Disc', progress: 40 }
];

export function completeQuestStep(questId: string) {
  console.log('🏆 Quest progress! Achievement unlocked: "Persistent Builder"');
}
