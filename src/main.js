/* Game state and the main loop: wires the model, world, characters and UI together. */
(function (CK) {
  'use strict';
  const { CONFIG: C, World, Effects, Audio, UI, Tween, Lines, Chef, Professor } = CK;

  const S = {
    started: false,
    ovens: 1,
    econ: null,
    econ1: null,
    chefs: [],
    leaving: [],
    maxSeen: { 1: 0, 2: 0 },
    found: { 1: false, 2: false },
    flags: {},
    acc: 0,
    ovenTurn: 0,
    lastBumpLine: 0,
    busy: false,
  };
  let prof;

  const say = (text, opts = {}) => UI.say(text, Object.assign({ prof }, opts));
  const stage = () => (S.chefs.length ? S.econ.rows[S.chefs.length].stage : 'none');

  function init() {
    World.init(document.getElementById('scene'));
    Effects.init(World.scene);
    prof = new Professor(World.scene, World.PROF_HOME);
    S.econ = S.econ1 = CK.computeEconomics(C, 1);
    UI.init({ onHire: hire, onFire: fire, onOven: buyOven, onQuiz: quiz, onStart: start });
    World.setViewShift(UI.initialShift || 0);
    UI.update(S);

    Chef.onBump = (dropped) => {
      const now = performance.now();
      if (now - S.lastBumpLine > 9000 && !S.busy) {
        S.lastBumpLine = now;
        prof.react('facepalm');
        if (dropped) say(Lines.bump(), { hold: 3 });
      }
    };
    window.addEventListener('resize', () => { World.resize(); UI.onResize(); });
    if (location.hash === '#debug') document.getElementById('fps').hidden = false;
    window.CKGame = { S, prof, hire, fire, buyOven, quiz }; // handy for debugging in the console
    requestAnimationFrame(loop);
  }

  async function start() {
    Audio.init();
    Audio.play('click');
    UI.hideIntro();
    S.busy = true;
    World.introSweep(2.4);
    await Tween.wait(0.8);
    await prof.flyIn();
    for (const line of Lines.intro()) await say(line, { next: true });
    S.started = true;
    S.busy = false;
    UI.update(S);
    UI.pulse('hireBtn');
    say(Lines.ready());
  }

  // Each chef's job comes straight from the economics model.
  function assignRoles() {
    const e = S.econ;
    let q = 0;
    S.chefs.forEach((chef, i) => {
      const L = i + 1, row = e.rows[L];
      if (L <= e.peakL && World.slots.work[i]) chef.setRole('work', World.slots.work[i]);
      else if (row.MP > 0 && World.slots.queue[q]) { chef.setRole('queue', World.slots.queue[q], q); q++; }
      else chef.setRole('crowd', null);
    });
  }

  function hire() {
    if (!S.started || S.busy) return;
    if (S.chefs.length >= C.maxChefs) { say(Lines.full()); prof.react('facepalm'); return; }
    const L = S.chefs.length + 1;
    const chef = new Chef(L);
    chef.spawn(World.scene, World.slots.entry());
    S.chefs.push(chef);
    S.maxSeen[S.ovens] = Math.max(S.maxSeen[S.ovens], L);
    if (L > S.econ.sweetSpot) S.flags[`past${S.ovens}`] = true;
    assignRoles();
    Audio.play('hire');
    UI.update(S);
    if (!checkSweetSpot()) {
      const { text, react } = Lines.onHire({ L, e: S.econ, flags: S.flags, lvl: S.ovens });
      prof.react(react);
      say(text);
    }
  }

  function fire() {
    if (!S.started || S.busy) return;
    if (!S.chefs.length) { say(Lines.nobodyToFire()); return; }
    const L = S.chefs.length;
    const chef = S.chefs.pop();
    S.leaving.push(chef);
    chef.leave((c) => { c.dispose(); S.leaving.splice(S.leaving.indexOf(c), 1); });
    assignRoles();
    Audio.play('fire');
    UI.update(S);
    if (!checkSweetSpot()) {
      const { text, react } = Lines.onFire({ L, e: S.econ });
      prof.react(react);
      say(text);
    }
  }

  // The sweet spot counts as "found" once the player has seen profit fall beyond it and come back.
  function checkSweetSpot() {
    const n = S.chefs.length, e = S.econ, lvl = S.ovens;
    if (n !== e.sweetSpot || S.found[lvl] || S.maxSeen[lvl] <= n) return false;
    S.found[lvl] = true;
    S.busy = true;
    UI.update(S);
    const info = { n, r: e.rows[n], next: e.rows[n + 1], lvl };
    prof.react('celebrate');
    Audio.play('fanfare');
    Effects.confetti(new THREE.Vector3(0, 3, 0), 180, 5);
    World.shake(0.12);
    say(Lines.sweet(info));
    setTimeout(async () => {
      await UI.celebrate({
        title: lvl === 1 ? 'You found the sweet spot!' : 'New sweet spot found!',
        body: Lines.sweetCard(info),
        button: lvl === 1 ? 'Unlock Level 2 ▸' : 'Take the quiz 🎓',
      });
      S.busy = false;
      if (lvl === 1) { UI.show('ovenBtn', true); UI.pulse('ovenBtn'); say(Lines.level2Prompt()); }
      else { UI.show('quizBtn', true); UI.pulse('quizBtn'); say(Lines.quizPrompt()); }
    }, 1300);
    return true;
  }

  async function buyOven() {
    if (S.ovens > 1 || S.busy) return;
    S.busy = true;
    UI.show('ovenBtn', false);
    S.ovens = 2;
    S.econ = CK.computeEconomics(C, 2);
    S.maxSeen[2] = S.chefs.length;
    if (S.chefs.length > S.econ.sweetSpot) S.flags.past2 = true;
    prof.react('ponder');
    await World.addSecondOven();
    assignRoles();
    UI.update(S);
    prof.react('spin');
    for (const line of Lines.level2()) await say(line, { next: true });
    S.busy = false;
    UI.update(S);
    UI.hideBubble();
    checkSweetSpot();
  }

  async function quiz() {
    if (S.busy) return;
    S.busy = true;
    UI.hideBubble();
    const score = await UI.runQuiz(CK.buildQuiz(), {
      onAnswer: (ok) => { prof.react(ok ? 'spin' : 'facepalm'); },
    });
    S.busy = false;
    if (score === 3) { Effects.confetti(new THREE.Vector3(0, 3, 0), 200, 5); Audio.play('fanfare'); prof.react('celebrate'); }
    say(Lines.quizEnd(score));
  }

  // ---------- Main loop ----------
  let last = performance.now(), fpsT = 0, frames = 0;
  const ndc = new THREE.Vector3();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, window.CK_MAX_DT || 0.05); // cap long frames (tests may raise it)
    last = now;
    const t = now / 1000;
    Tween.update(dt);

    // Croissant production is driven by total product from the model.
    const L = S.chefs.length;
    const rate = L ? Math.max(0, S.econ.rows[L].TP) * C.visual.croissantsPerSecondPerTP : 0;
    S.acc += rate * dt;
    while (S.acc >= 1) {
      S.acc -= 1;
      S.ovenTurn = (S.ovenTurn + 1) % S.ovens;
      World.spawnCroissant(S.ovenTurn);
    }

    const all = S.chefs.concat(S.leaving);
    Chef.all = all;
    const st = stage();
    all.forEach((c) => c.update(dt, t, st));
    Chef.interact(all, st);
    prof.update(dt, t, World.camera);
    World.update(dt, t, rate);
    Effects.update(dt);
    World.render(dt);
    UI.positionBubble(prof.screenAnchor(World.camera, ndc));

    frames++; fpsT += dt;
    if (fpsT > 0.5) { document.getElementById('fps').textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.CK = window.CK || {});
