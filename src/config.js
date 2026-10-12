/*
 * All the tweakable numbers live here.
 * Change wages, prices or the production schedule and the whole game
 * (chart, sweet spot, chef behaviour, quiz answers) follows automatically.
 */
(function (root) {
  'use strict';

  const CONFIG = {
    currency: '£',
    wage: 15,        // W: wage per chef per shift
    price: 2,        // P: price per croissant
    ovenRent: 20,    // F: fixed cost per oven per shift
    maxChefs: 12,

    // Marginal product of each successive chef (extra croissants per shift),
    // keyed by the number of ovens (the fixed factor).
    //   1 oven : chefs 1-3 rising, 4-7 shrinking, 8+ negative
    //   2 ovens: the whole schedule shifts up and diminishing returns arrive later
    marginalProduct: {
      1: [10, 14, 18, 14, 10, 6, 3, -2, -5, -8, -10, -12],
      2: [12, 16, 20, 22, 18, 14, 10, 6, 2, -2, -5, -8],
    },

    visual: {
      croissantsPerSecondPerTP: 0.065, // how fast croissants pop out for a given TP
      beltSpeed: 1.6,                  // conveyor speed (world units / second)
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CONFIG = CONFIG;
})(typeof window !== 'undefined' ? (window.CK = window.CK || {}) : {});
