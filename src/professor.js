/* Professor Margin: a hovering robot with a chalkboard face, a monocle and a whisk for an arm. */
(function (CK) {
  'use strict';
  const { U, Tween, Ease, Audio } = CK;
  const { damp, dampAngle, rand } = U;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const FACE_W = 256, FACE_H = 176;

  class Professor {
    constructor(scene, home) {
      this.home = home.clone();
      this.root = new THREE.Group();
      this.root.position.copy(home);
      this.root.scale.setScalar(1.2);
      this.bob = new THREE.Group();
      this.spin = new THREE.Group();
      this.root.add(this.bob);
      this.bob.add(this.spin);
      const S = this.spin;

      const metal = new THREE.MeshStandardMaterial({ color: 0x8fd8cc, metalness: 0.35, roughness: 0.35, flatShading: true });
      const steel = new THREE.MeshStandardMaterial({ color: 0xe3e9f0, metalness: 0.8, roughness: 0.25 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.7, roughness: 0.3 });
      const wood = new THREE.MeshStandardMaterial({ color: 0xb9825a, roughness: 0.7, flatShading: true });
      const navy = new THREE.MeshStandardMaterial({ color: 0x2f3550, roughness: 0.8, flatShading: true });
      const red = new THREE.MeshStandardMaterial({ color: 0xff6b7a, roughness: 0.6, flatShading: true });
      const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
      const add = (geo, m, parent, x = 0, y = 0, z = 0, cast = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; parent.add(o); return o; };

      // Body
      const body = add(new THREE.SphereGeometry(0.5, 14, 10), metal, S);
      body.scale.set(1, 0.85, 0.95);
      [0xff6b7a, 0xffd25e, 0x6fd3ff].forEach((c, i) => add(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: c }), S, -0.14 + i * 0.14, -0.05, 0.46, false));
      add(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 10), steel, S, 0, 0.45, 0);
      [-1, 1].forEach((s) => { const c = add(new THREE.ConeGeometry(0.09, 0.17, 4), red, S, s * 0.1, 0.42, 0.14); c.rotation.z = s * Math.PI / 2; });
      add(new THREE.SphereGeometry(0.045, 8, 6), red, S, 0, 0.42, 0.15);

      // Thruster glow underneath
      add(new THREE.CylinderGeometry(0.2, 0.12, 0.16, 12), navy, S, 0, -0.46, 0);
      this.flameMat = new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
      this.flame = add(new THREE.ConeGeometry(0.13, 0.5, 12), this.flameMat, S, 0, -0.78, 0, false);
      this.flame.rotation.x = Math.PI;

      // Head: chalkboard screen in a wooden frame, with a mortarboard
      this.head = new THREE.Group();
      this.head.position.y = 0.98;
      S.add(this.head);
      add(new THREE.BoxGeometry(1.28, 0.92, 0.2), wood, this.head);
      this.faceCanvas = document.createElement('canvas');
      this.faceCanvas.width = FACE_W;
      this.faceCanvas.height = FACE_H;
      this.faceCtx = this.faceCanvas.getContext('2d');
      this.board = this.makeBoard();
      this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
      add(new THREE.PlaneGeometry(1.1, 0.76), new THREE.MeshBasicMaterial({ map: this.faceTex }), this.head, 0, 0, 0.105, false);

      const cap = new THREE.Group();
      cap.position.y = 0.5;
      this.head.add(cap);
      add(new THREE.CylinderGeometry(0.3, 0.33, 0.16, 12), navy, cap, 0, 0.02, 0);
      const board = add(new THREE.BoxGeometry(0.95, 0.05, 0.95), navy, cap, 0, 0.12, 0);
      board.rotation.y = Math.PI / 4;
      add(new THREE.SphereGeometry(0.04, 8, 6), gold, cap, 0, 0.16, 0);
      this.tassel = new THREE.Group();
      this.tassel.position.set(0, 0.16, 0);
      cap.add(this.tassel);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), gold, this.tassel, 0.3, 0, 0).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.035, 0.06, 0.22, 6), gold, this.tassel, 0.6, -0.11, 0);

      // Monocle over the right eye, with a little chain
      const mx = (172 / FACE_W - 0.5) * 1.1, my = (0.5 - 72 / FACE_H) * 0.76;
      add(new THREE.TorusGeometry(0.15, 0.022, 8, 24), gold, this.head, mx, my, 0.14);
      add(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: 0xd9f1ff, transparent: true, opacity: 0.25 }), this.head, mx, my, 0.135, false);
      const chain = new THREE.CatmullRomCurve3([V(mx + 0.14, my - 0.06, 0.14), V(mx + 0.3, my - 0.3, 0.16), V(0.5, -0.42, 0.12)]);
      add(new THREE.TubeGeometry(chain, 16, 0.008, 4), gold, this.head, 0, 0, 0, false);

      // Whisk arm (robot's right, viewer's left)
      this.whiskArm = new THREE.Group();
      this.whiskArm.position.set(-0.5, 0.08, 0);
      this.whiskArm.rotation.order = 'YXZ';
      S.add(this.whiskArm);
      add(new THREE.SphereGeometry(0.1, 8, 6), steel, this.whiskArm);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), steel, this.whiskArm, 0, -0.2, 0);
      add(new THREE.CylinderGeometry(0.05, 0.04, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0xe0a060, roughness: 0.6 }), this.whiskArm, 0, -0.5, 0);
      this.whisk = new THREE.Group();
      this.whisk.position.y = -0.82;
      this.whiskArm.add(this.whisk);
      const wireGeo = new THREE.TorusGeometry(0.13, 0.009, 4, 18);
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Mesh(wireGeo, steel);
        w.rotation.y = (i * Math.PI) / 4;
        w.scale.set(1, 1.7, 1);
        this.whisk.add(w);
      }

      // Glove arm (robot's left, viewer's right): telescopes for facepalms
      this.gloveArm = new THREE.Group();
      this.gloveArm.position.set(0.5, 0.08, 0);
      this.gloveArm.rotation.order = 'YXZ';
      S.add(this.gloveArm);
      add(new THREE.SphereGeometry(0.1, 8, 6), steel, this.gloveArm);
      this.gloveTube = new THREE.Group();
      this.gloveArm.add(this.gloveTube);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), steel, this.gloveTube, 0, -0.21, 0);
      add(new THREE.SphereGeometry(0.13, 10, 8), white, this.gloveTube, 0, -0.5, 0);
      add(new THREE.SphereGeometry(0.05, 6, 5), white, this.gloveTube, -0.1, -0.44, 0.04);

      scene.add(this.root);

      this.expr = 'neutral';
      this.baseExpr = 'neutral';
      this.mouthOpen = false;
      this.talking = false;
      this.blinkT = rand(2, 4);
      this.talkT = 0;
      this.pose = { wx: 0, wy: 0, wz: -0.35, ws: 1, gx: 0, gy: 0, gz: 0.35, gs: 1, hx: 0, hz: 0 };
      this.reaction = null;
      this.reactionT = 0;
      this.hop = 0;
      this.drawFace();
    }

    makeBoard() {
      const c = document.createElement('canvas');
      c.width = FACE_W; c.height = FACE_H;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(128, 80, 20, 128, 88, 160);
      grad.addColorStop(0, '#386b55'); grad.addColorStop(1, '#264a3b');
      g.fillStyle = grad; g.fillRect(0, 0, FACE_W, FACE_H);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 10;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rand(0, 256), rand(0, 176)); g.lineTo(rand(0, 256), rand(0, 176)); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.font = '600 15px "Trebuchet MS", sans-serif';
      g.fillText('ΔTP/ΔL', 10, 166);
      g.fillText('MP↓', 212, 22);
      return c;
    }

    drawFace() {
      const c = this.faceCtx;
      c.drawImage(this.board, 0, 0);
      c.strokeStyle = c.fillStyle = 'rgba(250,250,240,0.95)';
      c.lineWidth = 8; c.lineCap = c.lineJoin = 'round';
      const eyes = [[84, 72], [172, 72]];
      const expr = this.expr;
      const circle = (x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); fill ? c.fill() : c.stroke(); };
      const line = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
      eyes.forEach(([x, y], i) => {
        const s = i ? 1 : -1;
        switch (expr) {
          case 'happy': c.beginPath(); c.arc(x, y + 10, 17, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); break;
          case 'blink': line(x - 15, y + 2, x + 15, y + 2); break;
          case 'surprised': circle(x, y, 18, false); circle(x, y, 6, true); break;
          case 'dismayed': line(x - 16, y - 18 - s * 6, x + 16, y - 18 + s * 6); circle(x, y + 4, 8, true); break;
          case 'thinking': circle(x, y, 15, false); circle(x + 6, y - 6, 6, true); if (i) line(x - 16, y - 26, x + 14, y - 32); break;
          case 'star': {
            c.beginPath();
            for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 8 : 20; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
            c.closePath(); c.fill(); break;
          }
          default: c.beginPath(); c.ellipse(x, y, 11, 15, 0, 0, Math.PI * 2); c.fill();
        }
      });
      c.beginPath();
      const open = this.mouthOpen;
      switch (expr) {
        case 'happy': case 'star':
          c.arc(128, 112, 32, 0.12 * Math.PI, 0.88 * Math.PI); if (open) { c.closePath(); c.fill(); } else c.stroke(); break;
        case 'surprised': c.arc(128, 128, open ? 14 : 10, 0, Math.PI * 2); c.stroke(); break;
        case 'dismayed':
          c.moveTo(98, 140); c.quadraticCurveTo(113, 124, 128, 136); c.quadraticCurveTo(143, 148, 158, 132); c.stroke(); break;
        case 'thinking': c.moveTo(108, 134); c.lineTo(148, open ? 128 : 130); c.stroke(); break;
        default:
          if (open) { c.ellipse(128, 126, 18, 12, 0, 0, Math.PI * 2); c.fill(); } else { c.arc(128, 110, 24, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
      }
      this.faceTex.needsUpdate = true;
    }

    setExpr(e) { if (this.expr !== e) { this.expr = e; this.drawFace(); } }
    setTalking(on) { this.talking = on; if (!on && this.mouthOpen) { this.mouthOpen = false; this.drawFace(); } }

    // Reactions: spin (output up), facepalm (output down), ponder, celebrate, wave.
    react(type) {
      this.reaction = type;
      this.reactionT = { spin: 1.2, facepalm: 2.0, ponder: 2.2, celebrate: 2.6, wave: 1.6, nod: 1.0 }[type] || 1.2;
      this.baseExpr = { spin: 'happy', facepalm: 'dismayed', ponder: 'thinking', celebrate: 'star', wave: 'happy', nod: 'neutral' }[type] || 'neutral';
      this.setExpr(this.baseExpr);
      if (type === 'spin' || type === 'celebrate') {
        Audio.play('spin');
        const turns = type === 'celebrate' ? 2 : 1;
        Tween.tween(type === 'celebrate' ? 1.4 : 0.9, (k) => { this.spin.rotation.y = k * Math.PI * 2 * turns; this.hop = Math.sin(k * Math.PI) * 0.6; }, {
          ease: Ease.outCubic, onComplete: () => { this.spin.rotation.y = 0; this.hop = 0; },
        });
      }
      if (type === 'facepalm') Audio.play('sad', 1500);
    }

    flyIn() {
      const from = this.home.clone().add(V(9, 5, 2));
      this.root.position.copy(from);
      Audio.play('whoosh');
      return new Promise((res) => Tween.tween(1.4, (k) => this.root.position.lerpVectors(from, this.home, k), {
        ease: Ease.outBack, onComplete: () => { this.react('wave'); res(); },
      }));
    }

    screenAnchor(camera, out) {
      out.copy(this.root.position);
      out.y += 1.9;
      return out.project(camera);
    }

    update(dt, t, camera) {
      // Hover, sway and turn to face the camera.
      this.bob.position.y = Math.sin(t * 1.8) * 0.12 + this.hop;
      this.bob.rotation.z = Math.sin(t * 1.3) * 0.05;
      const yaw = Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z);
      this.root.rotation.y = dampAngle(this.root.rotation.y, yaw, 3, dt);
      this.tassel.rotation.z = Math.sin(t * 2.4) * 0.15 - 0.1;
      this.tassel.rotation.y = Math.sin(t * 1.7) * 0.3;
      this.flame.scale.set(1, 0.8 + Math.sin(t * 30) * 0.15 + Math.random() * 0.1, 1);
      this.flameMat.opacity = 0.55 + Math.random() * 0.2;
      this.whisk.rotation.y += dt * (this.reaction === 'celebrate' ? 18 : 2);

      // Pose targets
      const T = { wx: -0.1, wy: 0, wz: -0.35 + Math.sin(t * 1.5) * 0.08, ws: 1, gx: -0.1, gy: 0, gz: 0.35 - Math.sin(t * 1.5) * 0.08, gs: 1, hx: 0, hz: Math.sin(t * 0.9) * 0.04 };
      if (this.reaction) {
        this.reactionT -= dt;
        switch (this.reaction) {
          case 'facepalm': T.gz = -2.68; T.gx = 0.4; T.gs = 1.65; T.hx = 0.28; T.hz = 0.12; break;
          case 'ponder': T.wz = 2.75; T.wx = 0.4 + Math.sin(t * 9) * 0.08; T.hz = -0.15; break;
          case 'celebrate': T.wz = -2.6 + Math.sin(t * 14) * 0.3; T.gz = 2.6 - Math.sin(t * 14) * 0.3; break;
          case 'wave': T.gz = 2.5 + Math.sin(t * 13) * 0.35; break;
          case 'nod': T.hx = Math.sin(t * 10) * 0.18; break;
          default: break;
        }
        if (this.reactionT <= 0) { this.reaction = null; this.baseExpr = 'neutral'; this.setExpr('neutral'); }
      }
      const P = this.pose;
      for (const k in T) P[k] = damp(P[k], T[k], 9, dt);
      this.whiskArm.rotation.set(P.wx, P.wy, P.wz);
      this.gloveArm.rotation.set(P.gx, P.gy, P.gz);
      this.gloveTube.scale.y = P.gs;
      this.head.rotation.set(P.hx, 0, P.hz);

      // Blinking + talking mouth
      this.blinkT -= dt;
      if (this.blinkT <= 0 && this.expr !== 'blink' && this.expr !== 'star') {
        const back = this.expr;
        this.setExpr('blink');
        setTimeout(() => this.setExpr(back === 'blink' ? this.baseExpr : back), 120);
        this.blinkT = rand(2.2, 5);
      }
      if (this.talking) {
        this.talkT -= dt;
        if (this.talkT <= 0) { this.mouthOpen = !this.mouthOpen; this.talkT = rand(0.07, 0.14); this.drawFace(); }
      }
    }
  }

  CK.Professor = Professor;
})(window.CK = window.CK || {});
