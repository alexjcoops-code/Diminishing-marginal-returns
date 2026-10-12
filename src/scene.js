/* The 3D world: renderer, camera, sky, floating island, kitchen, ovens, conveyor and croissants. */
(function (CK) {
  'use strict';
  const { U, Tween, Ease, Effects, Audio } = CK;
  const { part, mergeParts, vcMat, mat, rand, clamp } = U;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------- Layout (world units, y up, camera looks toward -z) ----------
  const FLOOR = 0.14;
  const COUNTER = { x: 0, z: 0.55, w: 6.8, d: 1.0, top: FLOOR + 0.93 };
  const BELT = { x0: -4.0, x1: 4.9, z: -1.95, y: FLOOR + 0.82, w: 0.7 };
  const BASKET = V(5.55, FLOOR, -1.95);
  const OVEN_X = [-3.0, 0.7];
  const OVEN_Z = -3.6;
  const LANE_Z = -1.05, FRONT_Z = 1.7, SIDE_X = 3.95;
  const WORK_X = [-1.3, 0, 1.3, -2.6, 2.6]; // fill from the middle outwards
  const QUEUE = [[-4.75, -2.45], [-5.25, -1.45], [-5.35, -0.45], [-5.35, 0.55], [-5.3, 1.55], [-5.2, 2.55]];
  const CROWD = { x0: -3.6, x1: 3.6, z0: 1.65, z1: 3.9 };
  const PROF_HOME = V(4.3, 2.5, 4.5);

  let renderer, scene, camera, controls;
  // Scratch objects reused every frame (no per-frame allocations).
  const _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(0, 0, 0), _s = V(1, 1, 1);
  const shake = { amount: 0, offset: V(0, 0, 0) };
  let viewShift = 0, fitDist = 18;

  const World = {
    FLOOR, PROF_HOME,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get controls() { return controls; },
    onSold: null,
    ovens: [],
    clouds: [],
    rocks: [],

    init(canvas) {
      const mobile = matchMedia('(pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xeee6ff, 55, 190);
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 800);

      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.8;
      controls.minPolarAngle = 0.35;
      controls.maxPolarAngle = 1.36;
      controls.minAzimuthAngle = -1.5;
      controls.maxAzimuthAngle = 1.5;
      controls.target.set(0, 1.1, 0.2);

      this.buildSky();
      this.buildLights(mobile);
      this.buildIsland();
      this.buildKitchen();
      this.buildClouds();
      this.buildCroissants();
      this.resize();
      this.resetCamera();
    },

    // ---------- Camera ----------
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Fit the kitchen (≈16 units wide) into the visible area, ignoring the side panel on desktop.
      const visW = Math.max(200, w - viewShift * 2);
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (visW / h));
      fitDist = clamp(Math.max(7.6 / Math.tan(hFov / 2), 5.6 / Math.tan(vFov / 2)), 15.5, 46);
      controls.minDistance = fitDist * 0.55;
      controls.maxDistance = fitDist * 1.35;
      this.applyViewOffset();
      Effects.resize(h * renderer.getPixelRatio(), camera.fov);
    },
    applyViewOffset() {
      const w = window.innerWidth, h = window.innerHeight;
      if (viewShift) camera.setViewOffset(w, h, viewShift, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    setViewShift(px) {
      const from = viewShift;
      Tween.tween(0.45, (k) => { viewShift = U.lerp(from, px, k); this.applyViewOffset(); }, { ease: Ease.inOutCubic, onComplete: () => this.resize() });
    },
    cameraPose(dist, azimuth = 0, polar = 1.0) {
      const t = controls.target;
      return V(t.x + dist * Math.sin(polar) * Math.sin(azimuth), t.y + dist * Math.cos(polar), t.z + dist * Math.sin(polar) * Math.cos(azimuth));
    },
    resetCamera() { camera.position.copy(this.cameraPose(fitDist)); controls.update(); },
    introSweep(duration = 2.4) {
      const from = this.cameraPose(fitDist * 1.9, -0.9, 0.62), to = this.cameraPose(fitDist);
      camera.position.copy(from);
      controls.enabled = false;
      return new Promise((res) => Tween.tween(duration, (k) => { camera.position.lerpVectors(from, to, k); }, {
        ease: Ease.inOutCubic, onComplete: () => { controls.enabled = true; res(); },
      }));
    },
    shake(amount) { shake.amount = Math.max(shake.amount, amount); },

    // ---------- Sky + lights ----------
    buildSky() {
      const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: new THREE.Color(0x8fc4ff) }, mid: { value: new THREE.Color(0xdcecff) }, bottom: { value: new THREE.Color(0xffdbe9) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top, mid, bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.65)) : mix(mid, bottom, pow(-h, 0.45)); gl_FragColor = vec4(c, 1.0); }',
      }));
      scene.add(sky);
    },
    buildLights(mobile) {
      scene.add(new THREE.HemisphereLight(0xd8eaff, 0xffcfb8, 0.52));
      const sun = new THREE.DirectionalLight(0xfff1dc, 0.82);
      sun.position.set(7, 16, 9);
      sun.castShadow = true;
      sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
      Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 45 });
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.03;
      scene.add(sun);
    },

    // ---------- Island ----------
    buildIsland() {
      const add = (geo, m, y, opts = {}) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.receiveShadow = opts.receive !== false; o.castShadow = !!opts.cast; scene.add(o); return o; };
      add(new THREE.CylinderGeometry(9, 8.7, 0.9, 14), mat(0x8fd67c), -0.45);
      add(new THREE.CylinderGeometry(8.7, 8.2, 0.7, 14), mat(0xc99673), -1.25);

      // Rocky underside: a jittered cone with a warm-to-lilac vertex-colour gradient.
      const g = new THREE.ConeGeometry(8.2, 8.5, 14, 5);
      g.rotateX(Math.PI);
      const p = g.attributes.position, colors = new Float32Array(p.count * 3), jit = new Map();
      const top = new THREE.Color(0xd1a88c), bottom = new THREE.Color(0x9a8ab8), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
        if (!jit.has(key)) jit.set(key, y > 4 || y < -4 ? [0, 0, 0] : [rand(-0.6, 0.6), rand(-0.4, 0.4), rand(-0.6, 0.6)]);
        const j = jit.get(key);
        p.setXYZ(i, x + j[0], y + j[1], z + j[2]);
        c.copy(top).lerp(bottom, clamp((4.25 - y) / 8.5, 0, 1));
        colors.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.computeVertexNormals();
      add(g, vcMat, -5.85, { receive: false });

      // Little floating rocks that bob below the island.
      for (let i = 0; i < 6; i++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.35, 0.9)), mat(0xb59aa8));
        const a = (i / 6) * Math.PI * 2 + 0.4, d = rand(9.5, 12);
        r.position.set(Math.cos(a) * d, rand(-6, -2), Math.sin(a) * d);
        r.userData.base = r.position.y;
        r.userData.phase = rand(0, 6);
        scene.add(r);
        this.rocks.push(r);
      }

      // Trees, bushes and flowers around the edge (kept out of the camera's way at the front).
      const P = [];
      const tree = (x, z, s, blossom) => {
        part(P, new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6), 0xa77457, [x, 0.45 * s, z], [0, 0, 0], [s, s, s]);
        if (blossom) {
          part(P, new THREE.IcosahedronGeometry(0.75, 0), 0xffb7cf, [x, 1.3 * s, z], [0.3, x, 0], [s, s, s]);
          part(P, new THREE.IcosahedronGeometry(0.5, 0), 0xffc9dc, [x + 0.35 * s, 1.75 * s, z - 0.1], [0, z, 0.4], [s, s, s]);
        } else {
          part(P, new THREE.ConeGeometry(0.75, 1.2, 7), 0x7fd08e, [x, 1.25 * s, z], [0, x, 0], [s, s, s]);
          part(P, new THREE.ConeGeometry(0.55, 0.95, 7), 0x95dd9e, [x, 1.85 * s, z], [0, z, 0], [s, s, s]);
        }
      };
      [[-7.6, -2.6, 1.1, false], [-6.4, -5.3, 1.25, true], [-3.6, -7.4, 1.0, false], [0.4, -7.9, 1.3, false],
        [4.0, -7.2, 1.1, true], [7.0, -4.2, 1.2, false], [7.9, -0.6, 0.9, true], [-8.1, 0.6, 0.85, false]].forEach((t) => tree(...t));
      [[-7.2, 3.6], [7.3, 3.4], [-4.5, 7.2], [4.8, 7.0], [7.6, 1.8], [-2.2, 7.9], [2.3, 7.9]].forEach(([x, z], i) => {
        part(P, new THREE.IcosahedronGeometry(0.45, 0), i % 2 ? 0x8fd9a0 : 0x9fe3a5, [x, 0.25, z], [i, i * 2, 0], [1.2, 0.8, 1]);
      });
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2), d = rand(6.9, 8.6);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) < 6.6 && Math.abs(z) < 5) continue;
        part(P, new THREE.SphereGeometry(0.08, 5, 4), [0xff8fab, 0xffe066, 0xffffff, 0xb39dff][i % 4], [x, 0.12, z]);
      }
      const deco = new THREE.Mesh(mergeParts(P), vcMat);
      deco.castShadow = true;
      deco.receiveShadow = true;
      scene.add(deco);
    },

    // ---------- Kitchen ----------
    buildKitchen() {
      // Checkered deck floor.
      const tiles = U.canvasTexture(128, 128, (c) => {
        c.fillStyle = '#fbe6cf'; c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#f4c2ad'; c.fillRect(0, 0, 64, 64); c.fillRect(64, 64, 64, 64);
      });
      tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
      tiles.repeat.set(6.4, 4.8);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(12.8, FLOOR, 9.6), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.9 }));
      deck.position.y = FLOOR / 2;
      deck.receiveShadow = true;
      scene.add(deck);

      const P = [];
      const box = (w, h, d, color, x, y, z, rot = [0, 0, 0]) => part(P, new THREE.BoxGeometry(w, h, d), color, [x, y, z], rot);
      // Deck trim
      box(13.0, 0.18, 0.2, 0xe2b07a, 0, 0.09, 4.85);
      box(0.2, 0.18, 9.8, 0xe2b07a, -6.5, 0.09, 0);
      box(0.2, 0.18, 9.8, 0xe2b07a, 6.5, 0.09, 0);

      // Counter: the fixed amount of counter space.
      const cz = COUNTER.z;
      box(6.6, 0.81, 0.96, 0x86c3e0, 0, FLOOR + 0.405, cz);
      box(6.9, 0.12, 1.1, 0xd99f63, 0, FLOOR + 0.87, cz);
      box(6.5, 0.1, 0.9, 0x86b9cf, 0, FLOOR + 0.05, cz);
      for (let i = 0; i < 5; i++) {
        const x = -2.6 + i * 1.3;
        box(1.1, 0.52, 0.03, 0xa6d6ec, x, FLOOR + 0.45, cz + 0.49);
        part(P, new THREE.SphereGeometry(0.045, 6, 4), 0xf3c14e, [x + 0.4, FLOOR + 0.5, cz + 0.52]);
      }
      WORK_X.forEach((x) => {
        box(0.7, 0.03, 0.45, 0xf6d7a7, x, COUNTER.top + 0.015, cz - 0.2);
        part(P, new THREE.SphereGeometry(0.15, 8, 6), 0xfff0d4, [x, COUNTER.top + 0.08, cz - 0.2], [0, 0, 0], [1, 0.55, 1]);
      });
      part(P, new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), 0xd9a066, [-0.65, COUNTER.top + 0.07, cz + 0.28], [0, 0, Math.PI / 2]);
      part(P, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), 0xb07a4f, [-0.65, COUNTER.top + 0.07, cz + 0.28], [0, 0, Math.PI / 2]);
      part(P, new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xffb5c8, [3.0, COUNTER.top + 0.25, cz + 0.2]);
      part(P, new THREE.SphereGeometry(0.2, 8, 6), 0xfff6ea, [3.0, COUNTER.top + 0.24, cz + 0.2], [0, 0, 0], [1, 0.4, 1]);
      box(0.42, 0.55, 0.3, 0xf7ecd8, -3.05, COUNTER.top + 0.27, cz + 0.25, [0, 0.3, 0]);
      box(0.3, 0.16, 0.02, 0x7fb7e8, -3.0, COUNTER.top + 0.3, cz + 0.42, [0, 0.3, 0]);

      // Back wall, shelves, jars and a striped awning.
      box(12.8, 2.3, 0.3, 0xffe3cf, 0, FLOOR + 1.15, -4.65);
      box(12.8, 0.8, 0.34, 0xeea893, 0, FLOOR + 0.4, -4.63);
      box(3.0, 0.08, 0.4, 0xe2b07a, 4.4, FLOOR + 1.65, -4.35);
      [0x9fd8cb, 0xffc4a8, 0xc9b6ff, 0xffe08a, 0xa8d8ea].forEach((col, i) => {
        part(P, new THREE.CylinderGeometry(0.13, 0.13, 0.32, 8), col, [3.2 + i * 0.6, FLOOR + 1.85, -4.35]);
        part(P, new THREE.CylinderGeometry(0.14, 0.14, 0.06, 8), 0xffffff, [3.2 + i * 0.6, FLOOR + 2.04, -4.35]);
      });
      box(1.6, 1.0, 0.05, 0xe2b07a, -5.4, FLOOR + 1.45, -4.48);
      box(1.45, 0.85, 0.05, 0xc7e7ff, -5.4, FLOOR + 1.45, -4.45);
      box(0.06, 0.85, 0.06, 0xe2b07a, -5.4, FLOOR + 1.45, -4.42);
      for (let i = 0; i < 13; i++) {
        const x = -6.0 + i * 1.0, col = i % 2 ? 0xfff8f2 : 0xff8fab;
        box(1.0, 0.07, 1.1, col, x, FLOOR + 2.62, -4.15, [0.42, 0, 0]);
        part(P, new THREE.SphereGeometry(0.5, 10, 6), col, [x, FLOOR + 2.4, -3.63], [0, 0, 0], [1, 0.32, 0.12]);
      }
      const kitchen = new THREE.Mesh(mergeParts(P), vcMat);
      kitchen.castShadow = true;
      kitchen.receiveShadow = true;
      scene.add(kitchen);

      // Shop sign.
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), new THREE.MeshBasicMaterial({ transparent: true, map: U.canvasTexture(512, 128, (c) => {
        c.fillStyle = '#fff7ef'; c.strokeStyle = '#ff8fa8'; c.lineWidth = 10;
        c.beginPath(); c.roundRect ? c.roundRect(8, 8, 496, 112, 50) : c.rect(8, 8, 496, 112); c.fill(); c.stroke();
        c.fillStyle = '#ff6f91'; c.font = '700 62px Fredoka, "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('Cloud Kitchen', 256, 68);
      }) }));
      sign.position.set(0, FLOOR + 3.4, -4.5);
      scene.add(sign);

      this.slots = {
        work: WORK_X.map((x) => ({ x, z: COUNTER.z - 0.9, face: 0 })),
        queue: QUEUE.map(([x, z], i) => {
          const [tx, tz] = i === 0 ? [-3.9, -2.7] : QUEUE[i - 1];
          return { x, z, face: Math.atan2(tx - x, tz - z) };
        }),
        crowd: CROWD,
        entry: () => V(rand(-1.2, 1.2), FLOOR, 3.5),
        exit: V(0, FLOOR, 4.25),
      };

      OVEN_X.forEach((x, i) => this.ovens.push(this.makeOven(x, i === 0)));
      this.buildConveyor();
    },

    makeOven(x, visible) {
      const P = [];
      const box = (w, h, d, color, px, py, pz) => part(P, new THREE.BoxGeometry(w, h, d), color, [px, py, pz]);
      box(2.3, 0.15, 1.7, 0xc97c68, 0, FLOOR + 0.075, 0);
      box(2.2, 1.25, 1.6, 0xee9c7f, 0, FLOOR + 0.7, 0);
      part(P, new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4ad90, [0, FLOOR + 1.3, 0], [0, 0, 0], [1.08, 0.85, 0.78]);
      box(1.12, 0.7, 0.08, 0xc97c68, 0, FLOOR + 0.6, 0.8);
      part(P, new THREE.CylinderGeometry(0.56, 0.56, 0.08, 14, 1, false, -Math.PI / 2, Math.PI), 0xc97c68, [0, FLOOR + 0.95, 0.8], [-Math.PI / 2, 0, 0]);
      box(0.86, 0.5, 0.06, 0x3a2a33, 0, FLOOR + 0.6, 0.83);
      part(P, new THREE.CylinderGeometry(0.43, 0.43, 0.06, 14, 1, false, -Math.PI / 2, Math.PI), 0x3a2a33, [0, FLOOR + 0.85, 0.83], [-Math.PI / 2, 0, 0]);
      [[-0.8, 1.15], [0.75, 0.35], [-0.75, 0.3], [0.85, 1.2], [-0.2, 1.75]].forEach(([bx, by]) => box(0.32, 0.12, 0.04, 0xf7b9a0, bx, FLOOR + by, 0.81));
      part(P, new THREE.CylinderGeometry(0.17, 0.2, 1.0, 8), 0xd88a73, [0.55, FLOOR + 2.3, 0.05]);
      part(P, new THREE.CylinderGeometry(0.23, 0.23, 0.12, 8), 0xb46d5c, [0.55, FLOOR + 2.82, 0.05]);
      part(P, new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12), 0xffffff, [0.78, FLOOR + 1.12, 0.82], [Math.PI / 2, 0, 0]);
      box(0.02, 0.1, 0.02, 0xe94f4f, 0.8, FLOOR + 1.15, 0.85);

      const group = new THREE.Group();
      const body = new THREE.Mesh(mergeParts(P), vcMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa043, transparent: true, opacity: 0.85 });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), glowMat);
      glow.position.set(0, FLOOR + 0.66, 0.865);
      glow.scale.set(1, 0.85, 1);
      group.add(glow);
      group.position.set(x, 0, OVEN_Z);
      group.visible = visible;
      scene.add(group);

      // Lights exist from the start (intensity 0 when hidden) so adding oven 2 never recompiles shaders.
      const light = new THREE.PointLight(0xffa25a, visible ? 1.0 : 0, 5, 2);
      light.position.set(x, FLOOR + 0.8, OVEN_Z + 1.3);
      scene.add(light);
      return { group, glow, glowMat, light, x, mouth: V(x, FLOOR + 0.62, OVEN_Z + 0.9), chimney: V(x + 0.55, FLOOR + 2.95, OVEN_Z + 0.05), active: visible, smokeT: 0 };
    },

    addSecondOven() {
      const ov = this.ovens[1];
      ov.group.visible = true;
      ov.group.position.y = 9;
      ov.group.scale.set(0.8, 1.25, 0.8);
      Audio.play('whoosh');
      return new Promise((res) => Tween.tween(0.9, (k) => { ov.group.position.y = U.lerp(9, 0, k); }, {
        ease: Ease.inQuad,
        onComplete: () => {
          Audio.play('thunk');
          this.shake(0.35);
          Effects.puff(V(ov.x, FLOOR + 0.3, OVEN_Z), { count: 30, spread: 1.4, speed: 3, size: 0.9, color: 0xfff6ee });
          Tween.tween(0.6, (k) => { const s = Math.sin(k * Math.PI * 3) * (1 - k) * 0.3; ov.group.scale.set(1 + s, 1 - s, 1 + s); }, { ease: Ease.linear });
          Tween.tween(0.6, (k) => { ov.light.intensity = k; });
          ov.active = true;
          res();
        },
      }));
    },

    buildConveyor() {
      const P = [];
      const len = BELT.x1 - BELT.x0, cx = (BELT.x0 + BELT.x1) / 2;
      part(P, new THREE.BoxGeometry(len, 0.16, 0.8), 0x8ea7c2, [cx, BELT.y - 0.1, BELT.z]);
      [-1, 1].forEach((s) => part(P, new THREE.BoxGeometry(len, 0.1, 0.06), 0x6f89a6, [cx, BELT.y + 0.03, BELT.z + s * 0.42]));
      [BELT.x0 + 0.3, cx, BELT.x1 - 0.3].forEach((x) => [-1, 1].forEach((s) => part(P, new THREE.BoxGeometry(0.1, BELT.y - 0.1, 0.1), 0x6f89a6, [x, (BELT.y - 0.1) / 2, BELT.z + s * 0.3])));
      [BELT.x0, BELT.x1].forEach((x) => part(P, new THREE.CylinderGeometry(0.11, 0.11, 0.84, 10), 0x5b6f86, [x, BELT.y - 0.06, BELT.z], [Math.PI / 2, 0, 0]));
      // Basket at the end with a little pile of croissants and a price tag.
      part(P, new THREE.CylinderGeometry(0.58, 0.44, 0.6, 10), 0xd9a86c, [BASKET.x, FLOOR + 0.3, BASKET.z]);
      part(P, new THREE.TorusGeometry(0.58, 0.06, 5, 12), 0xc28f55, [BASKET.x, FLOOR + 0.6, BASKET.z], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) part(P, this.croissantGeo || this.makeCroissantGeo(), 0xefa848, [BASKET.x + Math.cos(i * 1.3) * 0.25, FLOOR + 0.66 + (i === 4 ? 0.08 : 0), BASKET.z + Math.sin(i * 1.3) * 0.25], [0.2, i * 1.2, 0.1]);
      part(P, new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), 0xa77457, [BASKET.x + 0.5, FLOOR + 0.8, BASKET.z + 0.3]);
      const frame = new THREE.Mesh(mergeParts(P), vcMat);
      frame.castShadow = true;
      frame.receiveShadow = true;
      scene.add(frame);

      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), new THREE.MeshBasicMaterial({ map: U.canvasTexture(128, 74, (c) => {
        c.fillStyle = '#fffaf0'; c.fillRect(0, 0, 128, 74); c.strokeStyle = '#ffb703'; c.lineWidth = 6; c.strokeRect(3, 3, 122, 68);
        c.fillStyle = '#5a3d2b'; c.font = '700 34px Fredoka, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`${CK.CONFIG.currency}${CK.CONFIG.price} each`, 64, 39);
      }) }));
      tag.position.set(BASKET.x + 0.5, FLOOR + 1.25, BASKET.z + 0.33);
      scene.add(tag);

      this.beltTex = U.canvasTexture(64, 32, (c) => {
        c.fillStyle = '#4b5568'; c.fillRect(0, 0, 64, 32);
        c.fillStyle = '#5f6b80'; c.fillRect(0, 0, 10, 32);
      });
      this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
      this.beltTex.repeat.set(len * 2.5, 1);
      const belt = new THREE.Mesh(new THREE.PlaneGeometry(len, BELT.w), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.7 }));
      belt.rotation.x = -Math.PI / 2;
      belt.position.set(cx, BELT.y, BELT.z);
      belt.receiveShadow = true;
      scene.add(belt);
    },

    // ---------- Clouds (one instanced mesh for every puff) ----------
    buildClouds() {
      const puffs = [];
      for (let i = 0; i < 18; i++) {
        const a = rand(0, Math.PI * 2), d = rand(22, 75);
        const below = i < 5;
        const cloud = { x: Math.cos(a) * d, y: below ? rand(-16, -8) : rand(-4, 16), z: Math.sin(a) * d - (below ? 0 : 10), speed: rand(0.4, 1.0), s: rand(1.6, 3.2), puffs: [] };
        if (Math.abs(cloud.x) < 14 && cloud.z > -6 && !below) cloud.z -= 30;
        const n = 4 + Math.floor(rand(0, 3));
        for (let j = 0; j < n; j++) cloud.puffs.push([(j - n / 2) * 0.9 + rand(-0.2, 0.2), rand(-0.1, 0.5) * (j % 2 ? 1 : 0.5), rand(-0.4, 0.4), rand(0.7, 1.25)]);
        this.clouds.push(cloud);
        puffs.push(...cloud.puffs);
      }
      const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xc9d4f2, emissiveIntensity: 0.45, roughness: 1, flatShading: true });
      this.cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), m, puffs.length);
      this.cloudMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cloudMesh.frustumCulled = false;
      scene.add(this.cloudMesh);
    },

    // ---------- Croissants + coins (instanced, pooled: no allocations during play) ----------
    makeCroissantGeo() {
      if (this.croissantGeo) return this.croissantGeo;
      const R = 0.17, arc = Math.PI * 1.3;
      const g = new THREE.TorusGeometry(R, 0.09, 6, 10, arc);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        let a = Math.atan2(v.y, v.x);
        if (a < -0.01) a += Math.PI * 2;
        const f = 0.35 + 0.65 * Math.sin(Math.PI * clamp(a / arc, 0, 1));
        const cx = Math.cos(a) * R, cy = Math.sin(a) * R;
        p.setXYZ(i, cx + (v.x - cx) * f, cy + (v.y - cy) * f, v.z * f);
      }
      g.rotateZ(Math.PI / 2 - arc / 2);
      g.rotateX(-Math.PI / 2);
      g.scale(1.1, 0.8, 1.1);
      g.center();
      g.computeVertexNormals();
      this.croissantGeo = U.shared(g);
      return g;
    },
    buildCroissants() {
      const MAX = 90;
      const m = new THREE.MeshStandardMaterial({ color: 0xe8963a, emissive: 0x2a1000, roughness: 0.55, flatShading: true });
      this.cMesh = new THREE.InstancedMesh(this.makeCroissantGeo(), m, MAX);
      this.cMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.cMesh.castShadow = true;
      this.cMesh.frustumCulled = false;
      scene.add(this.cMesh);
      this.cItems = Array.from({ length: MAX }, () => ({ on: false, phase: '', t: 0, age: 0, from: V(0, 0, 0), to: V(0, 0, 0), pos: V(0, 0, 0), rot: 0, spin: 0, sx: 1, sy: 1 }));

      const cm = new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0x6b4300, metalness: 0.55, roughness: 0.3 });
      const cg = new THREE.CylinderGeometry(0.15, 0.15, 0.045, 14);
      cg.rotateX(Math.PI / 2);
      this.coinMesh = new THREE.InstancedMesh(cg, cm, 16);
      this.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.coinMesh.frustumCulled = false;
      scene.add(this.coinMesh);
      this.coins = Array.from({ length: 16 }, () => ({ on: false, t: 0, x: 0, z: 0 }));
    },
    spawnCroissant(ovenIndex) {
      const ov = this.ovens[ovenIndex];
      const c = this.cItems.find((it) => !it.on);
      if (!c || !ov || !ov.active) return false;
      c.on = true; c.phase = 'pop'; c.t = 0; c.age = 0;
      c.from.copy(ov.mouth);
      c.to.set(ov.x + rand(-0.15, 0.25), BELT.y + 0.06, BELT.z + rand(-0.17, 0.17));
      c.pos.copy(c.from);
      c.rot = rand(0, Math.PI * 2); c.spin = rand(6, 10) * (Math.random() < 0.5 ? -1 : 1);
      ov.glowMat.opacity = 1;
      Audio.play('pop', 140);
      return true;
    },
    spawnCoin() {
      const c = this.coins.find((k) => !k.on);
      if (!c) return;
      c.on = true; c.t = 0; c.x = BASKET.x + rand(-0.2, 0.2); c.z = BASKET.z + rand(-0.1, 0.2);
    },

    // ---------- Navigation ----------
    // Chefs walk around the counter instead of through it.
    planPath(from, to) {
      const behind = (p) => p.z < COUNTER.z - 0.5 && Math.abs(p.x) < SIDE_X + 0.1;
      const fb = behind(from), tb = behind(to);
      const path = [];
      if (fb && tb) {
        if (Math.abs(from.x - to.x) > 0.2) path.push(V(from.x, FLOOR, LANE_Z), V(to.x, FLOOR, LANE_Z));
      } else if (fb !== tb) {
        const other = fb ? to : from; // the end that is not behind the counter
        const beside = Math.abs(other.x) >= SIDE_X - 0.1 && other.z < FRONT_Z; // already level with the back lane
        const sx = (beside ? Math.sign(other.x) : from.x + to.x <= 0 ? -1 : 1) * SIDE_X;
        if (fb) path.push(V(from.x, FLOOR, LANE_Z), V(sx, FLOOR, LANE_Z), ...(beside ? [] : [V(sx, FLOOR, FRONT_Z)]));
        else path.push(...(beside ? [] : [V(sx, FLOOR, FRONT_Z)]), V(sx, FLOOR, LANE_Z), V(to.x, FLOOR, LANE_Z));
      } else if (this.crossesCounter(from, to)) {
        path.push(V((from.x <= 0 ? -1 : 1) * SIDE_X, FLOOR, FRONT_Z));
      }
      path.push(V(to.x, FLOOR, to.z));
      return path;
    },
    crossesCounter(a, b) {
      for (let i = 1; i < 12; i++) {
        const t = i / 12, x = U.lerp(a.x, b.x, t), z = U.lerp(a.z, b.z, t);
        if (Math.abs(x) < COUNTER.w / 2 + 0.4 && z > COUNTER.z - 0.85 && z < COUNTER.z + 0.9) return true;
      }
      return false;
    },
    randomCrowdPoint() { return V(rand(CROWD.x0, CROWD.x1), FLOOR, rand(CROWD.z0, CROWD.z1)); },
    clampToDeck(p) { p.x = clamp(p.x, -6.1, 6.1); p.z = clamp(p.z, -4.2, 4.5); },

    // ---------- Per-frame ----------
    update(dt, t, productionRate) {
      this.beltTex.offset.x -= (CK.CONFIG.visual.beltSpeed * 2.5 * dt) % 1;
      this.updateCroissants(dt);
      this.updateCoins(dt);

      this.ovens.forEach((ov, i) => {
        if (!ov.active) return;
        const flick = 0.85 + Math.sin(t * 13 + i) * 0.06 + Math.sin(t * 7.3 + i * 2) * 0.05;
        ov.light.intensity = U.damp(ov.light.intensity, productionRate > 0 ? flick * 1.3 : 0.55, 6, dt);
        ov.glowMat.opacity = U.damp(ov.glowMat.opacity, productionRate > 0 ? 0.75 + Math.sin(t * 11 + i) * 0.1 : 0.35, 5, dt);
        ov.smokeT -= dt;
        if (ov.smokeT <= 0) { Effects.smoke(ov.chimney); ov.smokeT = productionRate > 0 ? 0.28 : 0.9; }
      });

      const mtx = _mtx, q = _q, e = _e, p = _p, s = _s;
      let k = 0;
      this.clouds.forEach((c) => {
        c.x += c.speed * dt;
        if (c.x > 90) c.x = -90;
        c.puffs.forEach(([px, py, pz, ps]) => {
          p.set(c.x + px * c.s, c.y + py * c.s + Math.sin(t * 0.3 + c.z) * 0.3, c.z + pz * c.s);
          s.setScalar(ps * c.s * 0.75);
          this.cloudMesh.setMatrixAt(k++, mtx.compose(p, q.setFromEuler(e.set(0, px, 0)), s));
        });
      });
      this.cloudMesh.instanceMatrix.needsUpdate = true;
      this.rocks.forEach((r) => { r.position.y = r.userData.base + Math.sin(t * 0.8 + r.userData.phase) * 0.3; r.rotation.y += dt * 0.1; });
    },

    updateCroissants(dt) {
      const mtx = _mtx, q = _q, e = _e, s = _s;
      const speed = CK.CONFIG.visual.beltSpeed;
      this.cItems.forEach((c, i) => {
        if (!c.on) { this.cMesh.setMatrixAt(i, mtx.makeScale(0, 0, 0)); return; }
        c.age += dt;
        let sx = 1, sy = 1;
        if (c.phase === 'pop') {
          c.t += dt / 0.55;
          const k = Math.min(c.t, 1);
          c.pos.lerpVectors(c.from, c.to, k);
          c.pos.y += 4 * 1.1 * k * (1 - k);
          c.rot += c.spin * dt;
          // Squash and stretch: stretched while flying, squashed on landing.
          sy = k < 0.5 ? 1.35 : 1.15; sx = k < 0.5 ? 0.8 : 0.9;
          if (k >= 1) { c.phase = 'belt'; c.t = 0; }
        } else if (c.phase === 'belt') {
          c.t += dt;
          c.pos.x += speed * dt;
          const w = Math.exp(-7 * c.t) * Math.cos(c.t * 22);
          sy = 1 - 0.45 * w; sx = 1 + 0.3 * w;
          if (c.pos.x >= BELT.x1 - 0.05) { c.phase = 'drop'; c.t = 0; c.from.copy(c.pos); c.to.set(BASKET.x + rand(-0.2, 0.2), FLOOR + 0.75, BASKET.z + rand(-0.2, 0.2)); }
        } else if (c.phase === 'drop') {
          c.t += dt / 0.4;
          const k = Math.min(c.t, 1);
          c.pos.lerpVectors(c.from, c.to, k);
          c.pos.y += 4 * 0.45 * k * (1 - k);
          c.rot += 6 * dt;
          sx = sy = 1 - k * 0.6;
          if (k >= 1) {
            c.on = false;
            this.spawnCoin();
            Audio.play('coin', 110);
            if (this.onSold) this.onSold();
            this.cMesh.setMatrixAt(i, mtx.makeScale(0, 0, 0));
            return;
          }
        }
        s.set(sx, sy, sx);
        this.cMesh.setMatrixAt(i, mtx.compose(c.pos, q.setFromEuler(e.set(0, c.rot, 0)), s));
      });
      this.cMesh.instanceMatrix.needsUpdate = true;
    },
    updateCoins(dt) {
      const mtx = _mtx, q = _q, e = _e, p = _p, s = _s;
      this.coins.forEach((c, i) => {
        if (!c.on) { this.coinMesh.setMatrixAt(i, mtx.makeScale(0, 0, 0)); return; }
        c.t += dt / 0.8;
        if (c.t >= 1) { c.on = false; this.coinMesh.setMatrixAt(i, mtx.makeScale(0, 0, 0)); return; }
        p.set(c.x, FLOOR + 0.8 + Ease.outCubic(c.t) * 1.3, c.z);
        s.setScalar(c.t < 0.2 ? c.t / 0.2 : c.t > 0.75 ? (1 - c.t) / 0.25 : 1);
        this.coinMesh.setMatrixAt(i, mtx.compose(p, q.setFromEuler(e.set(0, c.t * 14, 0)), s));
      });
      this.coinMesh.instanceMatrix.needsUpdate = true;
    },

    render(dt) {
      controls.update();
      if (shake.amount > 0.001) {
        shake.offset.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake.amount);
        shake.amount *= Math.exp(-dt * 9);
      } else shake.offset.set(0, 0, 0);
      camera.position.add(shake.offset);
      renderer.render(scene, camera);
      camera.position.sub(shake.offset);
    },
  };

  CK.World = World;
})(window.CK = window.CK || {});
