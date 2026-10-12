# Too Many Cooks in the Cloud Kitchen 🥐☁️

A single-page 3D game that teaches the **law of diminishing marginal returns**.
You run a bakery on a floating island with **one oven and a fixed counter** (the fixed factor).
Hire chefs one at a time (the variable factor) and watch croissant output rise, slow, then fall.
Your goal is to find the profit-maximising number of chefs, guided by **Professor Margin**, a hovering robot with a chalkboard face, a monocle and a whisk for an arm.

## Run it

- **Double-click `index.html`**. It works straight from the file system (libraries load from the jsDelivr CDN).
- Or run **`npm run dev`** and open http://localhost:5173. This is a zero-dependency Node static server, so there's nothing to install.
- `npm test` checks the economics model.

Add `#debug` to the URL to show an FPS counter.

## How to play

1. **Hire chefs.** Chefs 1–3 specialise (increasing returns, hearts and happy hops). Chefs 4–7 queue for the oven with arms crossed (diminishing returns). From chef 8, chefs crash into each other, drop trays and fill the air with flour, and total output *falls* (negative returns).
2. Each chef costs **£15/shift** and each croissant sells for **£2**. Hire while a chef's extra croissants are worth more than their wage (MP × P ≥ W).
3. Find the sweet spot by going past it, seeing profit fall, and firing back down. That unlocks **Level 2: Upgrade the Oven**. The whole curve shifts up, which shows that diminishing returns are a *short-run* effect of a fixed factor.
4. Find the new sweet spot to unlock **Quiz Me** (3 questions built from the live model).

The data panel plots **TP, MP and AP** live. It shades the three stages, marks where **MP starts to fall** and where **MP = 0** (TP peaks), and renders the formulas with KaTeX. On phones it collapses into a bottom drawer.

## Tweak the economics

Everything lives in [`src/config.js`](src/config.js):

```js
wage: 15, price: 2, ovenRent: 20, maxChefs: 12,
marginalProduct: {
  1: [10, 14, 18, 14, 10, 6, 3, -2, -5, -8, -10, -12], // one oven
  2: [12, 16, 20, 22, 18, 14, 10, 6, 2, -2, -5, -8],   // two ovens
},
```

`computeEconomics(config, ovens)` in [`src/economics.js`](src/economics.js) is a single pure function. It returns every row (TP, MP, AP, MRP, profit, stage) plus the landmarks: the MP peak, the MP = 0 crossing and the sweet spot. Chef behaviour, chart markers, dialogue and quiz answers are all derived from it, so changing the numbers just works.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/config.js` | Tweakable numbers |
| `src/economics.js` | Pure production / profit model (also runs in Node for tests) |
| `src/utils.js` | Tween engine, easing, maths, shared materials, geometry merging |
| `src/audio.js` | Web Audio synthesised SFX (coins, pops, bumps, fanfare; no files) |
| `src/effects.js` | Pooled particle system (flour, smoke, sparkles, confetti) in one draw call |
| `src/scene.js` | Renderer, orbit camera, sky, island, kitchen, ovens, conveyor, instanced croissants, clouds |
| `src/chef.js` | Low-poly chefs: roles, path-finding around the counter, poses, bumps, disposal |
| `src/professor.js` | Professor Margin: chalkboard face (blinks, talks), spin, facepalm, ponder, celebrate |
| `src/dialogue.js` | Professor's lines (each under 20 words) and the quiz |
| `src/ui.js` | HUD, Chart.js chart and marker plugin, KaTeX, speech bubble, overlays, drawer |
| `src/main.js` | Game state and the main loop |

The files are plain classic scripts sharing a `CK` namespace. ES modules are blocked on `file://`, so this is what keeps double-click-to-play working.

**Performance notes:** croissants, coins and clouds use `InstancedMesh`. Each chef is about 7 merged vertex-coloured meshes. Particles are a single `Points` draw call. A busy scene is around 120 draw calls and 30k triangles, and the frame logic costs about 1–2 ms of JS. Fired chefs free their own geometries and materials (`Chef.dispose`). Shared resources are flagged so they're never double-freed. The second oven's light exists from the start so buying it doesn't trigger a shader recompile.

Built with Three.js r147, Chart.js 4 and KaTeX 0.16.
