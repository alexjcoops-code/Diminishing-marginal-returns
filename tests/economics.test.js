// Run with: npm test
const assert = require('assert');
const CONFIG = require('../src/config.js');
const { computeEconomics } = require('../src/economics.js');

const one = computeEconomics(CONFIG, 1);
const two = computeEconomics(CONFIG, 2);

const stages = (e) => e.rows.slice(1).map((r) => r.stage[0]).join('');
assert.strictEqual(stages(one), 'iiidddd' + 'nnnnn', 'one oven: 1-3 increasing, 4-7 diminishing, 8+ negative');
assert.strictEqual(one.peakL, 3);
assert.strictEqual(one.zeroL, 8);
assert.strictEqual(one.tpPeakL, 7);
assert.ok(one.zeroCrossX > 7 && one.zeroCrossX < 8);
assert.strictEqual(one.sweetSpot, 5, 'MRP >= wage up to chef 5');

assert.strictEqual(two.peakL, 4);
assert.strictEqual(two.sweetSpot, 7);
for (let L = 1; L <= CONFIG.maxChefs; L++) {
  assert.ok(two.rows[L].TP > one.rows[L].TP, `second oven lifts TP at L=${L}`);
}
assert.ok(two.rows[two.sweetSpot].profit > one.rows[one.sweetSpot].profit, 'oven upgrade pays');
// AP = TP / L and MP = ΔTP / ΔL
for (let L = 1; L <= CONFIG.maxChefs; L++) {
  const r = one.rows[L];
  assert.strictEqual(r.MP, r.TP - one.rows[L - 1].TP);
  assert.strictEqual(r.AP, r.TP / L);
}
console.log('economics: all tests passed');
console.log('1 oven TP:', one.rows.map((r) => r.TP).join(' '), '| sweet spot', one.sweetSpot);
console.log('2 oven TP:', two.rows.map((r) => r.TP).join(' '), '| sweet spot', two.sweetSpot);
