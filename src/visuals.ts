export function fightViz(enemy: string, myHp: number, enemyHp: number) {
  console.log('⚔️  [YOU] ' + '█'.repeat(myHp/10) + ' VS ' + enemy + ' ' + '█'.repeat(enemyHp/10));
  console.log('💥 CHRARGE MODE ACTIVE 💥');
}

export function drawInternalMap(room: string) {
  console.log('🗺️  [Internal Map] You are in ' + room + ' — North: Temple, South: Shops');
}
