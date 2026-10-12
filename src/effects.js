/* Particle effects: flour clouds, smoke, sparkles, confetti. One draw call via a pooled Points cloud. */
(function (CK) {
  'use strict';
  const { rand } = CK.U;
  const MAX = 600;

  const vertexShader = `
    attribute float psize; attribute float palpha; attribute vec3 pcolor; attribute float pshape;
    varying float vAlpha; varying vec3 vColor; varying float vShape;
    uniform float uScale;
    void main() {
      vAlpha = palpha; vColor = pcolor; vShape = pshape;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = psize * uScale / -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const fragmentShader = `
    varying float vAlpha; varying vec3 vColor; varying float vShape;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float a = vShape < 0.5 ? smoothstep(0.5, 0.12, length(c)) : step(abs(c.x), 0.42) * step(abs(c.y), 0.22);
      if (a * vAlpha < 0.01) discard;
      gl_FragColor = vec4(vColor, a * vAlpha);
    }`;

  const tmp = new THREE.Color();
  const CONFETTI = [0xff6b8b, 0xffc93c, 0x4fc3f7, 0x7ee081, 0xb388ff, 0xff9f43];

  const Effects = {
    init(scene) {
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(MAX * 3);
      this.col = new Float32Array(MAX * 3);
      this.size = new Float32Array(MAX);
      this.alpha = new Float32Array(MAX);
      this.shape = new Float32Array(MAX);
      const attr = (name, arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
      this.aPos = attr('position', this.pos, 3);
      this.aCol = attr('pcolor', this.col, 3);
      this.aSize = attr('psize', this.size, 1);
      this.aAlpha = attr('palpha', this.alpha, 1);
      this.aShape = attr('pshape', this.shape, 1);
      this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 500 } }, vertexShader, fragmentShader, transparent: true, depthWrite: false });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = 10;
      scene.add(this.points);
      this.p = Array.from({ length: MAX }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, a: 1, g: 0, drag: 0, flutter: 0, seed: 0 }));
      this.cursor = 0;
      this.alive = 0;
    },

    resize(heightPx, fovDeg) {
      if (this.mat) this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    },

    emit(o) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const p = this.p[i];
      p.life = 0; p.max = o.life || 1;
      p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
      p.size = o.size || 0.5; p.grow = o.grow || 0; p.a = o.alpha == null ? 1 : o.alpha;
      p.g = o.gravity || 0; p.drag = o.drag || 0; p.flutter = o.flutter || 0; p.seed = Math.random() * 10;
      this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
      tmp.set(o.color == null ? 0xffffff : o.color);
      this.col[i * 3] = tmp.r; this.col[i * 3 + 1] = tmp.g; this.col[i * 3 + 2] = tmp.b;
      this.shape[i] = o.shape || 0;
      this.size[i] = p.size;
      this.alpha[i] = p.a;
      this.aCol.needsUpdate = this.aShape.needsUpdate = true;
    },

    puff(at, { count = 14, color = 0xffffff, spread = 0.5, speed = 1.4, size = 0.6, life = 0.9, rise = 0.5, alpha = 0.85 } = {}) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * rand(0.4, 1);
        this.emit({
          x: at.x + Math.cos(a) * spread * Math.random(), y: at.y + rand(0, spread * 0.6), z: at.z + Math.sin(a) * spread * Math.random(),
          vx: Math.cos(a) * s, vy: rise * rand(0.5, 1.5), vz: Math.sin(a) * s,
          size: size * rand(0.6, 1.2), grow: size * 0.9, life: life * rand(0.7, 1.2), color, alpha, drag: 2.5,
        });
      }
    },
    smoke(at) {
      this.emit({ x: at.x + rand(-0.06, 0.06), y: at.y, z: at.z + rand(-0.06, 0.06), vx: rand(0.05, 0.25), vy: rand(0.6, 0.9), vz: rand(-0.1, 0.1),
        size: 0.35, grow: 0.9, life: 2.6, color: 0xf4f0ff, alpha: 0.55, drag: 0.2 });
    },
    sparkle(at, { count = 8, color = 0xffe066 } = {}) {
      for (let i = 0; i < count; i++) {
        this.emit({ x: at.x, y: at.y, z: at.z, vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5), size: rand(0.12, 0.24), grow: -0.1, life: rand(0.4, 0.8), color, gravity: -5 });
      }
    },
    confetti(at, count = 140, spread = 5) {
      for (let i = 0; i < count; i++) {
        this.emit({ x: at.x + rand(-spread, spread), y: at.y + rand(-0.5, 1.5), z: at.z + rand(-spread * 0.6, spread * 0.6),
          vx: rand(-2, 2), vy: rand(3, 8), vz: rand(-2, 2), size: rand(0.18, 0.3), life: rand(2.2, 3.4),
          color: CONFETTI[i % CONFETTI.length], gravity: -6, drag: 1.1, shape: 1, flutter: 1 });
      }
    },

    update(dt) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        const p = this.p[i];
        if (p.life >= p.max) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; any = true; } continue; }
        any = true;
        p.life += dt;
        const k = p.life / p.max;
        const dragK = Math.exp(-p.drag * dt);
        p.vx *= dragK; p.vz *= dragK; p.vy = p.vy * dragK + p.g * dt;
        this.pos[i * 3] += p.vx * dt; this.pos[i * 3 + 1] += p.vy * dt; this.pos[i * 3 + 2] += p.vz * dt;
        let s = Math.max(0.01, p.size + p.grow * k);
        if (p.flutter) s *= 0.55 + 0.45 * Math.abs(Math.sin(p.life * 9 + p.seed));
        this.size[i] = s;
        this.alpha[i] = p.a * (k < 0.1 ? k / 0.1 : 1 - Math.pow((k - 0.1) / 0.9, 2));
      }
      if (any) { this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true; }
    },
  };

  CK.Effects = Effects;
})(window.CK = window.CK || {});
