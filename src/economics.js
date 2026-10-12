/*
 * The economics model: one pure function, no side effects.
 * Given the config and the number of ovens it returns the full production
 * schedule plus the landmarks the game cares about.
 */
(function (root) {
  'use strict';

  function computeEconomics(config, ovens) {
    const table = config.marginalProduct[ovens] || config.marginalProduct[1];
    const { price, wage, maxChefs } = config;
    const fixed = config.ovenRent * ovens;

    const rows = [{ L: 0, TP: 0, MP: null, AP: null, MRP: null, revenue: 0, wages: 0, fixed, profit: -fixed, stage: 'none' }];
    let tp = 0;
    let peakL = 1;
    for (let L = 1; L <= maxChefs; L++) {
      const mp = table[Math.min(L - 1, table.length - 1)];
      tp += mp;
      if (L > 1 && mp > rows[peakL].MP) peakL = L;
      rows.push({
        L, TP: tp, MP: mp, AP: tp / L, MRP: mp * price,
        revenue: tp * price, wages: L * wage, fixed,
        profit: tp * price - L * wage - fixed,
      });
    }

    // Marginal product peaks at peakL, falls afterwards, and hits zero at zeroL.
    let zeroL = null;
    for (let L = 1; L <= maxChefs; L++) if (rows[L].MP <= 0) { zeroL = L; break; }
    let zeroCrossX = null;
    if (zeroL) {
      const a = zeroL > 1 ? rows[zeroL - 1].MP : 0;
      const b = rows[zeroL].MP;
      zeroCrossX = zeroL - 1 + (a === b ? 0 : a / (a - b));
    }

    let sweetSpot = 0;
    let maxTP = 0;
    for (const r of rows) {
      if (r.profit > rows[sweetSpot].profit) sweetSpot = r.L;
      maxTP = Math.max(maxTP, r.TP);
      if (r.L > 0) r.stage = r.L <= peakL ? 'increasing' : r.MP > 0 ? 'diminishing' : 'negative';
    }

    return {
      ovens, rows, peakL, zeroL, zeroCrossX, sweetSpot, maxTP,
      tpPeakL: zeroL ? zeroL - 1 : maxChefs,
      minMP: Math.min(...rows.slice(1).map((r) => r.MP)),
      maxMP: rows[peakL].MP,
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { computeEconomics };
  else root.computeEconomics = computeEconomics;
})(typeof window !== 'undefined' ? (window.CK = window.CK || {}) : {});
