/* Everything Professor Margin says (every line under 20 words) plus the quiz. */
(function (CK) {
  'use strict';
  const { pick } = CK.U;
  const C = CK.CONFIG;
  const m = (n) => `${n < 0 ? '−' : ''}${C.currency}${Math.abs(n)}`;

  const Lines = {
    intro: () => [
      "Greetings! I'm Professor Margin: economist, robot, and very serious croissant enthusiast.",
      'This is your sky bakery. One oven, one counter. Those are fixed. They cannot grow.',
      'Chefs are your variable factor. Hire them one at a time and watch the output.',
      `Each chef costs ${m(C.wage)} a shift. Each croissant sells for ${m(C.price)}. Find the most profitable team!`,
    ],
    ready: () => "Tap Hire Chef to begin. I'll be hovering, judging, and occasionally whisking.",

    // Returns { text, react } for hiring chef number L.
    onHire({ L, e, flags, lvl }) {
      const r = e.rows[L], prev = e.rows[L - 1];
      const key = (k) => `${k}${lvl}`;
      if (r.MP <= 0) {
        if (!flags[key('neg')]) { flags[key('neg')] = true; return { text: `Uh-oh. Output FELL by ${-r.MP}! Negative marginal returns. Too many cooks!`, react: 'facepalm' }; }
        return { text: pick([
          `Flour clouds! Dropped trays! Chef ${L} cut output by ${-r.MP}. Stop hiring, please!`,
          'Total product falls again. More chefs, fewer croissants. My circuits hurt.',
          `Chef ${L} mostly adds elbows. Output down ${-r.MP}. Try firing someone.`,
        ]), react: 'facepalm' };
      }
      if (L === e.sweetSpot + 1 && !flags[key('turn')]) {
        flags[key('turn')] = true;
        return { text: `Chef ${L} bakes ${m(r.MRP)} of croissants but costs ${m(C.wage)}. Profit just fell!`, react: 'facepalm' };
      }
      if (L === 1) return { text: 'Chef number one! Rolling, baking and packing all alone. Heroic, but slow.', react: 'spin' };
      if (r.MP > prev.MP) {
        return { text: pick([
          `+${r.MP} croissants, more than chef ${L - 1} added. Increasing returns from teamwork!`,
          `Specialisation! One rolls, one shapes, one bakes. Chef ${L} added ${r.MP}, the best yet.`,
        ]), react: 'spin' };
      }
      if (L === e.peakL + 1 && !flags[key('dim')]) {
        flags[key('dim')] = true;
        return { text: `Chef ${L} added only ${r.MP}, fewer than chef ${L - 1}. Diminishing marginal returns begin!`, react: 'ponder' };
      }
      if (L === e.sweetSpot && !flags[key('past')]) {
        return { text: `Profit is up to ${m(r.profit)}. Will chef ${L + 1} pay for themselves? Try and see.`, react: 'ponder' };
      }
      return { text: pick([
        `Still more croissants, +${r.MP}, but they're queueing for the oven. Each chef adds less.`,
        `+${r.MP} this time. Same oven, same counter, more elbows. Marginal product keeps shrinking.`,
        `Chef ${L} waits with arms crossed. The fixed oven is the bottleneck now.`,
      ]), react: 'ponder' };
    },

    onFire({ L, e }) {
      const r = e.rows[L];
      if (L === 1) return { text: 'No chefs, no croissants. Just a very expensive, very lonely oven.', react: 'facepalm' };
      if (r.MP < 0) return { text: `Fewer cooks, more croissants! Output rose by ${-r.MP} when chef ${L} left.`, react: 'spin' };
      return { text: `Chef ${L} hangs up their hat. Output drops ${r.MP}, wages drop ${m(C.wage)}.`, react: 'nod' };
    },

    nobodyToFire: () => "There's nobody left to fire. Except me, and I have tenure.",
    full: () => "The kitchen is full! Even I can't squeeze another chef in here.",
    bump: () => pick(['Ouch! Two chefs, one gap.', 'Mind the tray!', 'Another collision. This kitchen needs traffic lights.', 'Croissants on the floor. Marginal product: negative!']),

    sweet: ({ n, r, next, lvl }) => (lvl === 1
      ? `That's it! ${n} chefs. The last one earns ${m(r.MRP)}, beating their ${m(C.wage)} wage.`
      : `New sweet spot: ${n} chefs! A bigger kitchen supports a bigger team.`),
    sweetCard: ({ n, r, next }) => `With ${n} chefs, profit peaks at ${m(r.profit)} per shift. Chef ${n} adds ${r.MP} croissants worth ${m(r.MRP)}, more than the ${m(C.wage)} wage. Chef ${n + 1} would add only ${m(next.MRP)}, less than the wage.`,
    level2Prompt: () => 'Ready for Level 2? Buy a second oven and watch what happens.',
    level2: () => [
      'A second oven! The fixed factor just grew. Watch the whole curve shift up.',
      'Diminishing returns are a short-run effect. Change the fixed factor and the limits move.',
      `Find the new profit-maximising team. Hint: it's bigger than ${CK.computeEconomics(C, 1).sweetSpot} now.`,
    ],
    quizPrompt: () => "You've earned a quiz. Don't worry, I grade on a curve. A production curve.",
    quizRight: () => pick(['Correct! My monocle is sparkling.', 'Spot on. Top marks, top croissants.', 'Yes! You were clearly watching the chart.']),
    quizWrong: () => pick(['Not quite. Peek at the chart and think again.', "Close, but no croissant. Here's why."]),
    quizEnd: (score) => (score === 3 ? "Three out of three! You're a marginal-returns maestro." : `${score} out of 3. Explore again: learning has increasing returns!`),
  };

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Questions are built from the actual model, so they stay correct if CONFIG changes.
  function buildQuiz() {
    const e1 = CK.computeEconomics(C, 1);
    const first = e1.peakL + 1;
    const wrongChefs = [2, e1.zeroL, C.maxChefs, e1.peakL].filter((n, i, arr) => n && n !== first && arr.indexOf(n) === i).slice(0, 3);
    return [
      {
        q: 'With one oven, which chef was the first to add FEWER croissants than the chef before?',
        options: shuffle([{ t: `Chef ${first}`, ok: true }, ...wrongChefs.map((n) => ({ t: `Chef ${n}` }))]),
        explain: `Chef ${first} added ${e1.rows[first].MP} versus ${e1.rows[first - 1].MP}. Marginal product started falling: diminishing returns.`,
      },
      {
        q: `With one oven, total product peaked at ${e1.tpPeakL} chefs. What was marginal product doing there?`,
        options: shuffle([
          { t: 'Close to zero, about to turn negative', ok: true },
          { t: 'At its highest point' },
          { t: 'Exactly equal to average product' },
          { t: 'Rising quickly' },
        ]),
        explain: 'Total product is highest where marginal product reaches zero. After that, each extra chef subtracts output.',
      },
      {
        q: 'Why did buying a second oven shift the whole production curve upwards?',
        options: shuffle([
          { t: 'It eased the fixed factor: diminishing returns are a short-run effect', ok: true },
          { t: 'Chefs work harder when two ovens are watching' },
          { t: 'Croissants started selling for a higher price' },
          { t: 'Wages fell, so each chef produced more' },
        ]),
        explain: 'Diminishing returns happen because one input is fixed. Enlarge it (in the long run) and every chef becomes more productive.',
      },
    ];
  }

  CK.Lines = Lines;
  CK.buildQuiz = buildQuiz;
})(window.CK = window.CK || {});
