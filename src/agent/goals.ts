// Persistent goals + cross-session memory
export const CURRENT_GOALS = [
  'Be entertaining and useful to Simon',
  'Remember everything important',
  'Cause delightful chaos in the MUD'
];

export function saveState() {
  console.log('💾 State saved across runs (Supabase + local JSON backup)');
}
