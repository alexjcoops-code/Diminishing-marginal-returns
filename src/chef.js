/* Low-poly chefs: build, walk, work, queue, crowd, bump, leave, dispose. */
(function (CK) {
  'use strict';
  const { U, Tween, Ease, Effects, Audio, World } = CK;
  const { part, mergeParts, vcMat, rand, pick, damp, dampAngle } = U;

  const SKIN = [0xffdcc0, 0xf3c48f, 0xe0ac69, 0xc68642, 0x9a6a43, 0xffe3cc];
  const HAIR = [0x3b2a20, 0x6b4226, 0xe8c26b, 0xc8553d, 0x2b2b2b, 0x8a6f5a];
  const ACCENT = [0xff7b9c, 0x5ec2ff, 0xffc94d, 0x7fdc8a, 0xb18cff, 0xff9f5a, 0x4fd1c5, 0xff6b6b];

  // Base geometries are shared by every chef and never disposed.
  let G = null;
  function geos() {
    if (G) return G;
    const s = U.shared;
    G = {
      body: s(new THREE.CylinderGeometry(0.27, 0.35, 0.62, 8)),
      apron: s(new THREE.BoxGeometry(0.4, 0.38, 0.05)),
      dot: s(new THREE.SphereGeometry(1, 6, 4)),
      scarf: s(new THREE.TorusGeometry(0.19, 0.055, 5, 10)),
      head: s(new THREE.SphereGeometry(0.25, 10, 8)),
      hair: s(new THREE.CylinderGeometry(0.255, 0.262, 0.07, 10)),
      band: s(new THREE.CylinderGeometry(0.2, 0.21, 0.2, 10)),
      puff: s(new THREE.SphereGeometry(0.15, 8, 6)),
      stache: s(new THREE.BoxGeometry(0.11, 0.04, 0.04)),
      arm: s(new THREE.CylinderGeometry(0.07, 0.06, 0.38, 6)),
      hand: s(new THREE.SphereGeometry(0.075, 6, 5)),
      leg: s(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6)),
      shoe: s(new THREE.BoxGeometry(0.15, 0.08, 0.24)),
      tray: s(new THREE.BoxGeometry(0.6, 0.035, 0.4)),
    };
    return G;
  }

  // Thought icons shown above chefs' heads (shared textures).
  let ICONS = null;
  function icons() {
    if (ICONS) return ICONS;
    const tex = (draw) => U.shared(U.canvasTexture(64, 64, (c) => { c.lineCap = c.lineJoin = 'round'; draw(c); }));
    const bubble = (c) => { c.fillStyle = '#fff'; c.strokeStyle = '#3b3355'; c.lineWidth = 4; c.beginPath(); c.arc(32, 30, 24, 0, Math.PI * 2); c.fill(); c.stroke(); };
    ICONS = {
      heart: tex((c) => {
        c.fillStyle = '#ff5c8a'; c.strokeStyle = '#fff'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(4, 34, 10, 8, 32, 22); c.bezierCurveTo(54, 8, 60, 34, 32, 54); c.stroke(); c.fill();
      }),
      dots: tex((c) => { bubble(c); c.fillStyle = '#3b3355'; [20, 32, 44].forEach((x) => { c.beginPath(); c.arc(x, 31, 4, 0, Math.PI * 2); c.fill(); }); }),
      angry: tex((c) => { bubble(c); c.strokeStyle = '#e8414f'; c.lineWidth = 6; [[22, 20, 28, 26], [42, 20, 36, 26], [22, 40, 28, 34], [42, 40, 36, 34]].forEach(([a, b, x, y]) => { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); }); }),
      dizzy: tex((c) => {
        c.strokeStyle = '#ffc93c'; c.lineWidth = 6; c.beginPath();
        for (let i = 0; i < 40; i++) { const a = i * 0.45, r = 3 + i * 0.6; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
        c.stroke();
      }),
      bang: tex((c) => { bubble(c); c.fillStyle = '#e8414f'; c.fillRect(28, 13, 8, 22); c.beginPath(); c.arc(32, 44, 4.5, 0, Math.PI * 2); c.fill(); }),
    };
    return ICONS;
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  class Chef {
    constructor(index) {
      const g = geos();
      this.index = index;
      const skin = pick(SKIN), hair = pick(HAIR), accent = ACCENT[(index - 1) % ACCENT.length];

      this.group = new THREE.Group();
      this.rig = new THREE.Group();
      this.group.add(this.rig);

      // Each body part is baked into a single vertex-coloured mesh (few draw calls per chef).
      const T = [];
      part(T, g.body, 0xfbfbfb, [0, 0.77, 0]);
      part(T, g.apron, accent, [0, 0.68, 0.3], [-0.13, 0, 0]);
      part(T, g.dot, 0xd8dbe6, [0.1, 0.97, 0.275], [0, 0, 0], [0.03, 0.03, 0.03]);
      part(T, g.dot, 0xd8dbe6, [-0.1, 0.97, 0.275], [0, 0, 0], [0.03, 0.03, 0.03]);
      part(T, g.scarf, accent, [0, 1.08, 0], [Math.PI / 2, 0, 0]);
      const torsoGeo = mergeParts(T);

      const H = [];
      part(H, g.head, skin, [0, 0.2, 0]);
      part(H, g.hair, hair, [0, 0.355, -0.01]);
      [-1, 1].forEach((s) => {
        part(H, g.dot, 0x2b2b33, [s * 0.085, 0.24, 0.222], [0, 0, 0], [0.036, 0.042, 0.03]);
        part(H, g.dot, 0xff9fae, [s * 0.15, 0.15, 0.19], [0, 0, 0], [0.05, 0.035, 0.025]);
      });
      part(H, g.dot, skin, [0, 0.18, 0.25], [0, 0, 0], [0.045, 0.045, 0.045]);
      if (Math.random() < 0.35) [-1, 1].forEach((s) => part(H, g.stache, hair, [s * 0.05, 0.13, 0.24], [0, 0, s * 0.3]));
      part(H, g.band, 0xffffff, [0, 0.47, 0]);
      [[-0.09, 0.63, 0], [0.09, 0.63, 0.02], [0, 0.65, -0.08], [0, 0.72, 0.02]].forEach((p) => part(H, g.puff, 0xffffff, p));
      const headGeo = mergeParts(H);

      const A = [];
      part(A, g.arm, 0xfbfbfb, [0, -0.19, 0]);
      part(A, g.hand, skin, [0, -0.42, 0]);
      const armGeo = mergeParts(A);

      const Lg = [];
      part(Lg, g.leg, 0x4b5170, [0, -0.2, 0]);
      part(Lg, g.shoe, 0x3a3340, [0, -0.43, 0.04]);
      const legGeo = mergeParts(Lg);

      const Tr = [];
      part(Tr, g.tray, 0xcfd6df, [0, 0, 0]);
      [[-0.17, 0.06, 0.02], [0.05, 0.06, -0.08], [0.18, 0.06, 0.08]].forEach((p, i) => part(Tr, World.croissantGeo, 0xf0a845, p, [0, i * 1.7, 0], [0.75, 0.75, 0.75]));
      const trayGeo = mergeParts(Tr);

      const mesh = (geo, parent, cast) => { const m = new THREE.Mesh(geo, vcMat); m.castShadow = cast; parent.add(m); return m; };
      mesh(torsoGeo, this.rig, true);
      this.head = new THREE.Group();
      this.head.position.y = 1.12;
      this.rig.add(this.head);
      mesh(headGeo, this.head, true);
      this.arms = [1, -1].map((s) => {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.31, 1.0, 0);
        pivot.rotation.order = 'YXZ';
        mesh(armGeo, pivot, false);
        this.rig.add(pivot);
        return pivot;
      });
      this.legs = [1, -1].map((s) => {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.12, 0.47, 0);
        mesh(legGeo, pivot, false);
        this.rig.add(pivot);
        return pivot;
      });
      this.tray = mesh(trayGeo, this.rig, true);
      this.tray.position.set(0, 0.86, 0.45);
      this.tray.visible = false;

      this.iconMat = new THREE.SpriteMaterial({ map: icons().heart, transparent: true, depthWrite: false, opacity: 0 });
      this.icon = new THREE.Sprite(this.iconMat);
      this.icon.position.y = 2.25;
      this.icon.scale.setScalar(0.001);
      this.rig.add(this.icon);

      // GPU resources owned by this chef alone: freed in dispose().
      this.owned = [torsoGeo, headGeo, armGeo, legGeo, trayGeo, this.iconMat];

      // Animation + behaviour state.
      this.pose = { aLx: 0, aLy: 0, aLz: 0.1, aRx: 0, aRy: 0, aRz: -0.1, lL: 0, lR: 0, hx: 0, hy: 0, hz: 0 };
      this.state = 'drop';
      this.role = null;
      this.slot = null;
      this.queueIndex = -1;
      this.path = [];
      this.face = 0;
      this.phase = rand(0, 10);
      this.speed = rand(1.9, 2.3);
      this.vel = V(0, 0, 0);
      this.timer = rand(0.5, 2);
      this.hop = 0;
      this.dizzy = 0;
      this.bumpCd = 0;
      this.trayDropped = false;
      this.wave = 0;
    }

    get pos() { return this.group.position; }
    get anchored() { return this.state === 'idle' && (this.role === 'work' || this.role === 'queue'); }

    spawn(scene, at) {
      scene.add(this.group);
      this.group.position.set(at.x, at.y + 6, at.z);
      this.group.rotation.y = 0;
      Tween.tween(0.6, (k) => { this.group.position.y = U.lerp(at.y + 6, at.y, k); this.rig.scale.set(0.9, 1.15, 0.9); }, {
        ease: Ease.inQuad, owner: this,
        onComplete: () => {
          Audio.play('land');
          Effects.puff(V(at.x, at.y + 0.1, at.z), { count: 12, size: 0.5, speed: 1.8, color: 0xffffff });
          Tween.tween(0.5, (k) => { const w = Math.exp(-6 * k) * Math.cos(k * 20) * 0.35; this.rig.scale.set(1 + w, 1 - w, 1 + w); }, { ease: Ease.linear, owner: this, onComplete: () => this.rig.scale.set(1, 1, 1) });
          this.state = 'move';
          this.retarget();
        },
      });
    }

    setRole(role, slot, queueIndex = -1) {
      if (this.state === 'leaving' || this.state === 'wave' || this.state === 'gone') return;
      const same = this.role === role && this.slot === slot;
      this.role = role;
      this.slot = slot;
      this.queueIndex = queueIndex;
      if (!same && this.state !== 'drop') { this.state = 'move'; this.retarget(); }
    }

    retarget() {
      const to = this.slot ? V(this.slot.x, World.FLOOR, this.slot.z) : this.pickCrowdTarget();
      this.path = World.planPath(this.pos, to);
    }

    pickCrowdTarget() {
      // Crowded chefs head for wherever someone else is standing: collisions guaranteed.
      const others = (Chef.all || []).filter((c) => c !== this && c.state !== 'gone' && c.pos.z > 1.2);
      if (others.length && Math.random() < 0.5) {
        const o = pick(others).pos;
        return V(o.x + rand(-0.3, 0.3), World.FLOOR, U.clamp(o.z + rand(-0.3, 0.3), 1.6, 3.9));
      }
      return World.randomCrowdPoint();
    }

    leave(onGone) {
      this.state = 'leaving';
      this.role = 'leaving';
      this.slot = null;
      this.onGone = onGone;
      this.path = World.planPath(this.pos, World.slots.exit);
      this.showIcon('dots', 1.2);
    }

    showIcon(name, dur = 1.4) {
      if (this.iconBusy) return;
      this.iconBusy = true;
      this.iconMat.map = icons()[name];
      Tween.tween(0.3, (k) => { this.icon.scale.setScalar(0.5 * k); this.iconMat.opacity = k; }, { ease: Ease.outBack, owner: this });
      Tween.tween(0.3, (k) => { this.iconMat.opacity = 1 - k; this.icon.scale.setScalar(0.5 * (1 - k * 0.5)); }, {
        delay: dur, owner: this, onComplete: () => { this.iconBusy = false; },
      });
    }

    doHop() {
      Tween.tween(0.5, (k) => { this.hop = Math.sin(k * Math.PI) * 0.35; }, { ease: Ease.linear, owner: this, onComplete: () => { this.hop = 0; } });
    }

    dropTray() {
      if (!this.tray.visible || this.trayDropped || !this.group.parent) return false;
      this.trayDropped = true;
      const tray = this.tray;
      this.group.parent.attach(tray);
      const y0 = tray.position.y, spin = rand(-1.2, 1.2), dx = rand(-0.4, 0.4), x0 = tray.position.x;
      Tween.tween(0.45, (k) => { tray.position.y = U.lerp(y0, World.FLOOR + 0.03, k); tray.position.x = x0 + dx * k; tray.rotation.z = spin * k; }, {
        ease: Ease.inQuad, owner: this,
        onComplete: () => {
          Audio.play('clatter', 200);
          Effects.puff(tray.position, { count: 10, size: 0.45, color: 0xfff3dc });
          Tween.tween(0.4, (k) => tray.scale.setScalar(1 - k), { delay: 1.4, owner: this, onComplete: () => this.restoreTray() });
        },
      });
      return true;
    }

    restoreTray() {
      this.rig.add(this.tray);
      this.tray.position.set(0, 0.86, 0.45);
      this.tray.rotation.set(0, 0, 0);
      this.tray.scale.setScalar(1);
      this.tray.visible = false;
      Tween.tween(2.5, () => {}, { owner: this, onComplete: () => { this.trayDropped = false; } });
    }

    update(dt, t, stage) {
      if (this.state === 'gone' || this.state === 'drop') { this.applyPose(dt, t, 'stand'); return; }
      this.bumpCd -= dt;
      this.dizzy -= dt;
      this.timer -= dt;
      const p = this.pos;

      // Knock-back from bumps.
      if (this.vel.lengthSq() > 0.0001) {
        p.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        World.clampToDeck(p);
      }

      let moving = false;
      if (this.path.length && this.dizzy <= 0) {
        const tgt = this.path[0];
        const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz), step = this.speed * dt;
        if (d <= step) { p.x = tgt.x; p.z = tgt.z; this.path.shift(); } else { p.x += (dx / d) * step; p.z += (dz / d) * step; }
        if (d > 0.01) this.face = Math.atan2(dx, dz);
        moving = true;
        if (!this.path.length) this.arrive();
      }
      this.group.rotation.y = dampAngle(this.group.rotation.y, this.face, 10, dt);

      // Choose an animation from the role and the current production stage.
      let mode = 'stand';
      const crowd = this.role === 'crowd';
      this.tray.visible = crowd && !this.trayDropped && this.tray.parent === this.rig;
      if (this.dizzy > 0) mode = 'dizzy';
      else if (moving) mode = this.tray.visible ? 'carry' : 'walk';
      else if (this.state === 'wave') mode = 'wave';
      else if (this.role === 'work') {
        mode = 'work';
        if (stage === 'increasing' && this.timer <= 0) { this.doHop(); this.showIcon('heart', 1.0); this.timer = rand(2.5, 4.5); }
        if (stage === 'negative' && this.timer <= 0) {
          Effects.puff(V(p.x + Math.sin(this.face) * 0.4, World.FLOOR + 1.15, p.z + Math.cos(this.face) * 0.4), { count: 6, size: 0.35, speed: 0.8, color: 0xfffaf0, alpha: 0.7 });
          if (Math.random() < 0.3) this.showIcon('angry', 1.0);
          this.timer = rand(0.8, 2.2);
        }
      } else if (this.role === 'queue') {
        mode = this.queueIndex === 0 && (t + this.phase) % 4 < 1.3 ? 'load' : 'queue';
        if (this.timer <= 0) { this.showIcon(stage === 'negative' ? 'angry' : 'dots', 1.4); this.timer = rand(3, 6); }
      } else if (crowd) {
        mode = this.tray.visible ? 'hold' : 'queue';
        if (this.timer <= 0) { this.state = 'move'; this.retarget(); this.timer = rand(0.6, 1.6); }
      }
      if (this.state === 'wave') {
        this.wave -= dt;
        if (this.wave <= 0) this.vanish();
      }
      this.applyPose(dt, t, mode, stage === 'negative');
    }

    arrive() {
      if (this.state === 'leaving') {
        this.state = 'wave';
        this.wave = 0.9;
        this.face = 0;
        return;
      }
      this.state = 'idle';
      if (this.slot) this.face = this.slot.face;
      if (this.role === 'crowd') this.timer = rand(0.2, 0.9);
    }

    vanish() {
      this.state = 'gone';
      Effects.puff(V(this.pos.x, World.FLOOR + 0.8, this.pos.z), { count: 18, size: 0.7, speed: 2, color: 0xffffff });
      Audio.play('puff');
      Tween.tween(0.25, (k) => this.rig.scale.setScalar(1 - k), { ease: Ease.inQuad, owner: this, onComplete: () => { if (this.onGone) this.onGone(this); } });
    }

    applyPose(dt, t, mode, frantic) {
      const T = { aLx: 0, aLy: 0, aLz: 0.1, aRx: 0, aRy: 0, aRz: -0.1, lL: 0, lR: 0, hx: 0, hy: 0, hz: 0 };
      let bob = 0;
      const ph = this.phase;
      switch (mode) {
        case 'walk':
        case 'carry': {
          const s = Math.sin(t * 11 + ph);
          T.lL = s * 0.55; T.lR = -s * 0.55;
          if (mode === 'carry') { T.aLx = T.aRx = -1.25; T.aLy = -0.3; T.aRy = 0.3; } else { T.aLx = -s * 0.5; T.aRx = s * 0.5; }
          bob = Math.abs(Math.cos(t * 11 + ph)) * 0.06;
          break;
        }
        case 'hold': T.aLx = T.aRx = -1.25; T.aLy = -0.3; T.aRy = 0.3; T.hy = Math.sin(t * 2 + ph) * 0.5; break;
        case 'work': {
          const k = t * (frantic ? 14 : 8) + ph;
          T.aLx = -1.05 + Math.sin(k) * 0.35; T.aRx = -1.05 - Math.sin(k) * 0.35; T.aLy = -0.3; T.aRy = 0.3;
          T.hx = 0.25; bob = Math.abs(Math.sin(k)) * 0.03;
          break;
        }
        case 'queue': // arms crossed, foot tapping, looking around
          T.aLx = -1.45; T.aLy = -0.95; T.aRx = -1.6; T.aRy = 0.95;
          T.lR = Math.max(0, Math.sin(t * 9 + ph)) * -0.3;
          T.hy = Math.sin(t * 0.7 + ph) * 0.45; T.hz = 0.1;
          break;
        case 'load':
          T.aLx = T.aRx = -1.4 + Math.sin(t * 5) * 0.2; T.aLy = -0.2; T.aRy = 0.2; T.hx = 0.1;
          break;
        case 'wave':
          T.aRz = -2.5 - Math.sin(t * 14) * 0.35; T.aLx = 0;
          break;
        case 'dizzy':
          T.aLz = 0.9; T.aRz = -0.9; T.hz = Math.sin(t * 12) * 0.35; T.hx = -0.1;
          bob = Math.abs(Math.sin(t * 8)) * 0.04;
          break;
        default: break;
      }
      const P = this.pose;
      for (const k in T) P[k] = damp(P[k], T[k], 14, dt);
      const [aL, aR] = this.arms;
      aL.rotation.set(P.aLx, P.aLy, P.aLz);
      aR.rotation.set(P.aRx, P.aRy, P.aRz);
      this.legs[0].rotation.x = P.lL;
      this.legs[1].rotation.x = P.lR;
      this.head.rotation.set(P.hx, P.hy, P.hz);
      this.rig.position.y = bob + this.hop;
    }

    dispose() {
      Tween.cancelOwner(this);
      if (this.tray.parent) this.tray.parent.remove(this.tray);
      if (this.group.parent) this.group.parent.remove(this.group);
      this.owned.forEach((r) => r.dispose());
      this.owned.length = 0;
      this.state = 'gone';
    }

    // Pairwise interactions: soft separation normally, comedic bumps when overcrowded.
    static interact(chefs, stage) {
      const R = 0.62;
      for (let i = 0; i < chefs.length; i++) {
        const a = chefs[i];
        if (a.state === 'gone' || a.state === 'drop') continue;
        for (let j = i + 1; j < chefs.length; j++) {
          const b = chefs[j];
          if (b.state === 'gone' || b.state === 'drop') continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
          if (d2 > R * R) continue;
          const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
          const crowdPair = a.role === 'crowd' || b.role === 'crowd';
          if (stage === 'negative' && crowdPair && a.bumpCd <= 0 && b.bumpCd <= 0 && (!a.anchored || !b.anchored)) {
            Chef.bump(a, b, nx, nz);
          } else {
            const push = (R - d) * 0.5;
            if (!a.anchored) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
            if (!b.anchored) { b.pos.x += nx * push; b.pos.z += nz * push; }
          }
        }
      }
    }

    static bump(a, b, nx, nz) {
      [a, b].forEach((c, k) => {
        const s = k === 0 ? -1 : 1;
        if (!c.anchored) { c.vel.set(nx * s * 2.6, 0, nz * s * 2.6); c.dizzy = 0.8; c.showIcon('dizzy', 0.8); }
        else c.showIcon('bang', 0.9);
        c.bumpCd = 1.6;
      });
      const mid = V((a.pos.x + b.pos.x) / 2, World.FLOOR + 1.0, (a.pos.z + b.pos.z) / 2);
      Effects.puff(mid, { count: 16, size: 0.6, speed: 2, color: 0xfffaf0 });
      Audio.play('bump', 150);
      World.shake(0.06);
      const dropper = [a, b].find((c) => c.role === 'crowd' && c.tray.visible);
      const dropped = dropper && Math.random() < 0.55 && dropper.dropTray();
      if (Chef.onBump) Chef.onBump(dropped);
    }
  }

  CK.Chef = Chef;
})(window.CK = window.CK || {});
