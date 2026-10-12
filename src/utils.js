/* Shared helpers: tweening, maths, materials and geometry merging. */
(function (CK) {
  'use strict';

  // ---------- Easing + tweens ----------
  const Ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
    outBounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  const active = [];
  function tween(duration, onUpdate, opts = {}) {
    const tw = {
      elapsed: -(opts.delay || 0), duration: Math.max(duration, 1e-4), onUpdate,
      ease: opts.ease || Ease.outCubic, onComplete: opts.onComplete, owner: opts.owner, dead: false,
    };
    active.push(tw);
    return tw;
  }
  function update(dt) {
    const n = active.length;
    for (let i = 0; i < n; i++) {
      const tw = active[i];
      if (tw.dead) continue;
      tw.elapsed += dt;
      if (tw.elapsed < 0) continue;
      const k = Math.min(tw.elapsed / tw.duration, 1);
      tw.onUpdate(tw.ease(k), k);
      if (k >= 1) { tw.dead = true; if (tw.onComplete) tw.onComplete(); }
    }
    let j = 0;
    for (let i = 0; i < active.length; i++) if (!active[i].dead) active[j++] = active[i];
    active.length = j;
  }
  const cancel = (tw) => { if (tw) tw.dead = true; };
  const cancelOwner = (owner) => active.forEach((tw) => { if (tw.owner === owner) tw.dead = true; });
  const wait = (sec) => new Promise((res) => tween(sec, () => {}, { onComplete: res, ease: Ease.linear }));

  // ---------- Maths ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Materials ----------
  // Shared resources are flagged so disposeTree() never frees something another mesh still uses.
  const matCache = new Map();
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!matCache.has(key)) {
      const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.02, flatShading: true }, opts));
      m.userData.shared = true;
      matCache.set(key, m);
    }
    return matCache.get(key);
  }
  const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.02 });
  vcMat.userData.shared = true;

  function shared(geo) { geo.userData.shared = true; return geo; }

  function disposeTree(obj) {
    obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => { if (!m.userData.shared) m.dispose(); });
    });
  }

  // ---------- Geometry merging ----------
  // Collect coloured parts, then bake them into ONE vertex-coloured mesh: far fewer draw calls.
  function part(list, geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    list.push({ geo, color, pos, rot, scale });
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
    _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function mergeParts(parts) {
    let total = 0;
    const prepared = parts.map((p) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      _m.compose(_p.fromArray(p.pos), _q.setFromEuler(_e.set(p.rot[0], p.rot[1], p.rot[2])), _s.fromArray(p.scale));
      g.applyMatrix4(_m);
      if (!g.attributes.normal) g.computeVertexNormals();
      total += g.attributes.position.count;
      return { g, color: p.color, src: p.geo };
    });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    prepared.forEach(({ g, color, src }) => {
      const count = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      _c.set(color);
      for (let i = 0; i < count; i++) { col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b; }
      o += count;
      g.dispose();
      if (!src.userData.shared) src.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  CK.Ease = Ease;
  CK.Tween = { tween, update, cancel, cancelOwner, wait };
  CK.U = { clamp, lerp, damp, dampAngle, angleDiff, rand, pick, mat, vcMat, shared, disposeTree, part, mergeParts, canvasTexture };
})(window.CK = window.CK || {});
