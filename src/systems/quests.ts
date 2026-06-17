// Full quest system
export interface Quest {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: 'active' | 'completed' | 'failed';
  rewards: string[];
}

export const activeQuests: Quest[] = [
  { id: 'watchtowers', title: 'Investigate the New Watchtowers', progress: 75, status: 'active', rewards: ['Guild favour', 'Legendary reputation'] }
];

export function updateQuestProgress(questId: string, delta: number) {
  console.log(`Quest progress updated! "${questId}" now at higher glory.`);
}
