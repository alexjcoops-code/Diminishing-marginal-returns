/* 2D overlay: HUD, live chart, KaTeX formulas, speech bubble, overlays, quiz and the mobile drawer. */
(function (CK) {
  'use strict';
  const { Audio, Tween, Ease } = CK;
  const C = CK.CONFIG;
  const $ = (id) => document.getElementById(id);
  const money = (n) => `${n < 0 ? '−' : ''}${C.currency}${Math.abs(Math.round(n))}`;
  const texMoney = (n) => `${n < 0 ? '-' : ''}\\pounds${Math.abs(Math.round(n))}`;
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

  const COLORS = { tp: '#f08a24', mp: '#3f7fe0', ap: '#9a5fe0', ghost: 'rgba(110,110,135,0.5)' };

  // Chart.js plugin that shades the three stages and marks where MP peaks and where it crosses zero.
  const markers = {
    id: 'ckMarkers',
    beforeDatasetsDraw(chart) {
      const s = UI.chartState;
      if (!s) return;
      const { ctx, chartArea: a, scales: { x, y1 } } = chart;
      const e = s.econ, seen = s.maxSeen;
      const end = seen + 0.5;
      const bands = [
        [0.5, e.peakL + 0.5, 'rgba(110,205,120,0.13)', 'Increasing'],
        [e.peakL + 0.5, (e.zeroL || C.maxChefs + 1) - 0.5, 'rgba(255,190,70,0.16)', 'Diminishing'],
        [(e.zeroL || C.maxChefs + 1) - 0.5, C.maxChefs + 0.5, 'rgba(240,95,95,0.13)', 'Negative'],
      ];
      ctx.save();
      ctx.font = '700 10px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      bands.forEach(([from, to, col, label]) => {
        if (from >= end) return;
        const x0 = Math.max(a.left, x.getPixelForValue(from)), x1 = Math.min(a.right, x.getPixelForValue(Math.min(to, end)));
        if (x1 <= x0) return;
        ctx.fillStyle = col;
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        if (x1 - x0 > 34) { ctx.fillStyle = 'rgba(59,51,85,0.55)'; ctx.fillText(label, (x0 + x1) / 2, a.bottom - 6); }
      });
      const zy = y1.getPixelForValue(0);
      ctx.strokeStyle = 'rgba(59,51,85,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.left, zy); ctx.lineTo(a.right, zy); ctx.stroke();
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const s = UI.chartState;
      if (!s) return;
      const { ctx, chartArea: a, scales: { x, y, y1 } } = chart;
      const e = s.econ;
      ctx.save();
      ctx.font = '800 10.5px Nunito, system-ui, sans-serif';
      const vline = (px, color, label, row) => {
        ctx.strokeStyle = color; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
        ctx.setLineDash([]);
        const w = ctx.measureText(label).width + 10, ty = a.top + 4 + row * 18;
        const bx = Math.min(Math.max(px - w / 2, a.left), a.right - w);
        ctx.fillStyle = color; roundRect(ctx, bx, ty, w, 15, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, bx + w / 2, ty + 11);
      };
      const ring = (px, py, color) => { ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke(); };
      if (s.maxSeen > e.peakL) {
        const px = x.getPixelForValue(e.peakL);
        vline(px, '#e09a14', 'MP starts to fall', 0);
        ring(px, y1.getPixelForValue(e.rows[e.peakL].MP), '#e09a14');
      }
      if (e.zeroL && s.maxSeen >= e.zeroL) {
        const px = x.getPixelForValue(e.zeroCrossX);
        vline(px, '#e0474c', 'MP = 0 · TP peaks', 1);
        ring(px, y1.getPixelForValue(0), '#e0474c');
        ring(x.getPixelForValue(e.tpPeakL), y.getPixelForValue(e.rows[e.tpPeakL].TP), '#e0474c');
      }
      if (s.found) {
        const px = x.getPixelForValue(e.sweetSpot), py = y.getPixelForValue(e.rows[e.sweetSpot].TP);
        star(ctx, px, py - 16, 9, '#ffb703');
      }
      if (s.current > 0) {
        const px = x.getPixelForValue(s.current);
        ctx.fillStyle = 'rgba(59,51,85,0.08)';
        ctx.fillRect(px - 9, a.top, 18, a.bottom - a.top);
      }
      ctx.restore();
    },
  };
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function star(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  const UI = {
    chartState: null,

    init(h) {
      this.h = h;
      $('hireBtn').addEventListener('click', () => { Audio.play('click'); h.onHire(); });
      $('fireBtn').addEventListener('click', () => { Audio.play('click'); h.onFire(); });
      $('ovenBtn').addEventListener('click', () => { Audio.play('click'); h.onOven(); });
      $('quizBtn').addEventListener('click', () => { Audio.play('click'); h.onQuiz(); });
      $('startBtn').addEventListener('click', () => h.onStart());
      const setMute = (m) => {
        Audio.setMuted(m);
        $('muteBtn').textContent = m ? '🔇' : '🔊';
        $('muteBtn').setAttribute('aria-pressed', String(m));
        try { localStorage.setItem('ck-muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      };
      try { if (localStorage.getItem('ck-muted') === '1') setMute(true); } catch (e) { /* storage unavailable */ }
      $('muteBtn').addEventListener('click', () => setMute(!Audio.isMuted()));
      $('bubble').addEventListener('click', (ev) => { if (ev.target.id !== 'bubbleNext') this.finishTyping(); });
      $('bubbleNext').addEventListener('click', () => { Audio.play('click'); this.advance(); });
      $('panelToggle').addEventListener('click', () => this.togglePanel());
      window.addEventListener('keydown', (ev) => {
        if (ev.target.tagName === 'BUTTON' && (ev.key === 'Enter' || ev.key === ' ')) return;
        if (!$('bubbleNext').hidden && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); this.advance(); return; }
        const overlayOpen = ['intro', 'celebrate', 'quiz'].some((id) => !$(id).hidden);
        if (overlayOpen || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
        const key = ev.key.toLowerCase();
        if (key === 'h' && !$('hireBtn').disabled) $('hireBtn').click();
        else if (key === 'f' && !$('fireBtn').disabled) $('fireBtn').click();
      });
      $('hireCost').textContent = `${money(C.wage)} / shift`;
      $('ovenCost').textContent = `+${money(C.ovenRent)} rent / shift`;
      this.panelOpen = !isMobile();
      this.syncPanel(false);
      this.initChart();
      this.shownProfit = 0;
    },

    // ---------- Panel / drawer ----------
    togglePanel() { this.panelOpen = !this.panelOpen; Audio.play('click'); this.syncPanel(true); },
    syncPanel(animate) {
      const p = $('panel');
      p.classList.toggle('open', this.panelOpen);
      $('panelToggle').setAttribute('aria-expanded', String(this.panelOpen));
      const shift = !isMobile() && this.panelOpen ? p.offsetWidth / 2 + 8 : 0;
      if (animate) CK.World.setViewShift(shift); else this.initialShift = shift;
    },
    onResize() {
      const wasMobile = this.mobile;
      this.mobile = isMobile();
      if (wasMobile !== undefined && wasMobile !== this.mobile) this.panelOpen = !this.mobile;
      this.syncPanel(true);
    },

    // ---------- Chart ----------
    initChart() {
      if (!window.Chart) { $('chartWrap').innerHTML = '<p class="muted">Chart unavailable offline.</p>'; return; }
      const e1 = CK.computeEconomics(C, 1), e2 = CK.computeEconomics(C, 2);
      const ds = (label, color, axis, extra) => Object.assign({ label, data: [], borderColor: color, backgroundColor: color, yAxisID: axis, tension: 0.32, borderWidth: 3, pointRadius: 3.5, pointHoverRadius: 6 }, extra);
      Chart.defaults.font.family = 'Nunito, system-ui, sans-serif';
      Chart.defaults.color = '#5b5378';
      this.chart = new Chart($('chart'), {
        type: 'line',
        data: {
          datasets: [
            ds('Total product (TP)', COLORS.tp, 'y', { fill: { target: 'origin', above: 'rgba(240,138,36,0.10)' } }),
            ds('Marginal product (MP)', COLORS.mp, 'y1'),
            ds('Average product (AP)', COLORS.ap, 'y1', { borderDash: [6, 4], borderWidth: 2.5 }),
            ds('TP, one oven', COLORS.ghost, 'y', { borderDash: [3, 4], borderWidth: 2, pointRadius: 0, hidden: true }),
            ds('MP, one oven', 'rgba(63,127,224,0.35)', 'y1', { borderDash: [3, 4], borderWidth: 2, pointRadius: 0, hidden: true }),
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, parsing: false, normalized: true,
          animation: { duration: 450, easing: 'easeOutCubic' },
          interaction: { mode: 'nearest', axis: 'x', intersect: false },
          layout: { padding: { top: 2, right: 2 } },
          scales: {
            x: { type: 'linear', min: 0, max: C.maxChefs, ticks: { stepSize: 1 }, title: { display: true, text: 'Chefs (L)', font: { weight: '700' } }, grid: { color: 'rgba(59,51,85,0.06)' } },
            y: { min: 0, max: Math.ceil(Math.max(e1.maxTP, e2.maxTP) / 20) * 20 + 10, title: { display: true, text: 'TP', color: COLORS.tp, font: { weight: '800' } }, grid: { color: 'rgba(59,51,85,0.06)' } },
            y1: { position: 'right', min: Math.floor(Math.min(e1.minMP, e2.minMP) / 5) * 5, max: Math.ceil(Math.max(e1.maxMP, e2.maxMP) / 5) * 5 + 5, title: { display: true, text: 'MP · AP', color: COLORS.mp, font: { weight: '800' } }, grid: { drawOnChartArea: false } },
          },
          plugins: {
            legend: { labels: { boxWidth: 14, boxHeight: 3, font: { size: 11, weight: '700' }, filter: (item, data) => !data.datasets[item.datasetIndex].hidden && item.datasetIndex !== 4 } },
            tooltip: { callbacks: { title: (items) => `${items[0].parsed.x} chef${items[0].parsed.x === 1 ? '' : 's'}`, label: (item) => `${item.dataset.label}: ${Math.round(item.parsed.y * 10) / 10}` } },
          },
        },
        plugins: [markers],
      });
    },

    // ---------- Data refresh ----------
    update(S) {
      const e = S.econ, L = S.chefs.length, r = e.rows[L], seen = S.maxSeen[S.ovens];
      this.chartState = { econ: e, maxSeen: seen, current: L, found: S.found[S.ovens] };

      if (this.chart) {
        const d = this.chart.data.datasets;
        d[0].data = e.rows.slice(0, seen + 1).map((row) => ({ x: row.L, y: row.TP }));
        d[1].data = e.rows.slice(1, seen + 1).map((row) => ({ x: row.L, y: row.MP }));
        d[2].data = e.rows.slice(1, seen + 1).map((row) => ({ x: row.L, y: row.AP }));
        const ghost = S.ovens > 1 ? S.econ1 : null;
        d[3].hidden = d[4].hidden = !ghost;
        if (ghost) {
          d[3].data = ghost.rows.slice(0, S.maxSeen[1] + 1).map((row) => ({ x: row.L, y: row.TP }));
          d[4].data = ghost.rows.slice(1, S.maxSeen[1] + 1).map((row) => ({ x: row.L, y: row.MP }));
        }
        const highlight = (arr) => arr.map((_, i) => (i === arr.length - 1 ? 6 : 3.5));
        d[0].pointRadius = d[0].data.map((p) => (p.x === L ? 6.5 : 3.5));
        d[1].pointRadius = highlight(d[1].data);
        this.chart.update();
      }

      // Formulas (KaTeX renders the fractions properly).
      if (L >= 1) {
        const prev = e.rows[L - 1];
        this.tex('fMP', `MP = \\dfrac{\\Delta TP}{\\Delta L} = \\dfrac{${r.TP} - ${prev.TP}}{${L} - ${L - 1}} = ${r.MP}`);
        this.tex('fAP', `AP = \\dfrac{TP}{L} = \\dfrac{${r.TP}}{${L}} \\approx ${r.AP.toFixed(1)}`);
      } else {
        this.tex('fMP', 'MP = \\dfrac{\\Delta TP}{\\Delta L}');
        this.tex('fAP', 'AP = \\dfrac{TP}{L}');
      }
      this.tex('fProfit', `\\begin{aligned}\\pi &= P\\cdot TP - W\\cdot L - F \\\\ &= ${texMoney(C.price)}(${r.TP}) - ${texMoney(C.wage)}(${L}) - ${texMoney(r.fixed)} = ${texMoney(r.profit)}\\end{aligned}`);

      // The marginal-revenue-product verdict for the last chef hired.
      const v = $('verdict');
      if (L === 0) {
        v.className = 'verdict';
        v.innerHTML = `Hire a chef if the croissants they add are worth more than their <b>${money(C.wage)}</b> wage.`;
      } else {
        const good = r.MRP >= C.wage;
        v.className = `verdict ${good ? 'good' : 'bad'}`;
        v.innerHTML = `<b>Chef ${L}</b> adds ${r.MP} croissant${Math.abs(r.MP) === 1 ? '' : 's'} × ${money(C.price)} = <b>${money(r.MRP)}</b> ${good ? '≥' : '<'} ${money(C.wage)} wage ${good ? '✓ worth it' : '✗ not worth it'}`;
      }

      // Table of everything observed so far.
      const rows = [];
      for (let i = 1; i <= seen; i++) {
        const row = e.rows[i];
        const cls = [i === L ? 'current' : '', row.stage, S.found[S.ovens] && i === e.sweetSpot ? 'sweet' : ''].join(' ');
        rows.push(`<tr class="${cls}"><td>${i}${S.found[S.ovens] && i === e.sweetSpot ? ' ★' : ''}</td><td>${row.TP}</td><td>${row.MP}</td><td>${row.AP.toFixed(1)}</td><td>${money(row.profit)}</td></tr>`);
      }
      $('tableBody').innerHTML = rows.join('') || '<tr><td colspan="5" class="muted">Hire chefs to fill the table</td></tr>';

      // HUD
      $('statChefs').textContent = L;
      $('statTP').textContent = r.TP;
      this.animateProfit(r.profit);
      $('levelBadge').textContent = S.ovens > 1 ? 'Level 2 · Two ovens' : 'Level 1 · One oven';
      $('handleSummary').textContent = L ? `TP ${r.TP} · MP ${r.MP} · ${money(r.profit)}` : '';
      const locked = !S.started || S.busy;
      $('hireBtn').disabled = locked || L >= C.maxChefs;
      $('fireBtn').disabled = locked || L === 0;
      $('ovenBtn').disabled = $('quizBtn').disabled = locked;
      const stage = L ? r.stage : 'none';
      document.body.dataset.stage = stage;
    },

    animateProfit(target) {
      if (target === this.profitTarget) return;
      this.profitTarget = target;
      const from = this.shownProfit, el = $('statProfit');
      el.classList.toggle('neg', target < 0);
      if (this.profitTween) Tween.cancel(this.profitTween);
      this.profitTween = Tween.tween(0.5, (k) => { this.shownProfit = from + (target - from) * k; el.textContent = money(this.shownProfit); }, { ease: Ease.outCubic });
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    },

    tex(id, s) {
      const el = $(id);
      if (window.katex) katex.render(s, el, { throwOnError: false, displayMode: false });
      else el.textContent = s.replace(/\\dfrac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)').replace(/\\[a-zA-Z]+/g, '');
    },

    show(id, on) { $(id).hidden = !on; if (on) { $(id).classList.remove('pop-in'); void $(id).offsetWidth; $(id).classList.add('pop-in'); } },
    pulse(id) { const el = $(id); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); },

    // ---------- Speech bubble ----------
    say(text, { next = false, hold = 6, prof } = {}) {
      return new Promise((resolve) => {
        this.finishPending();
        clearInterval(this.typeTimer);
        clearTimeout(this.hideTimer);
        const b = $('bubble'), t = $('bubbleText'), n = $('bubbleNext');
        b.hidden = false;
        b.classList.remove('bubble-in'); void b.offsetWidth; b.classList.add('bubble-in');
        n.hidden = true;
        const chars = [...text];
        let i = 0;
        this.prof = prof;
        if (prof) prof.setTalking(true);
        this.typing = { chars, done: () => {
          clearInterval(this.typeTimer);
          t.textContent = text;
          this.typing = null;
          if (prof) prof.setTalking(false);
          if (next) { n.hidden = false; this.pending = resolve; } else {
            this.hideTimer = setTimeout(() => { b.hidden = true; }, hold * 1000);
            resolve();
          }
        } };
        t.textContent = '';
        this.typeTimer = setInterval(() => {
          i += 2;
          t.textContent = chars.slice(0, i).join('');
          if (i % 6 === 0) Audio.play('blip');
          if (i >= chars.length && this.typing) this.typing.done();
        }, 26);
      });
    },
    finishTyping() { if (this.typing) this.typing.done(); },
    advance() { if (this.typing) { this.typing.done(); return; } this.finishPending(); },
    finishPending() { if (this.pending) { const p = this.pending; this.pending = null; $('bubbleNext').hidden = true; p(); } },
    hideBubble() { $('bubble').hidden = true; },

    positionBubble(ndc) {
      const b = $('bubble');
      if (b.hidden) return;
      if (isMobile()) { b.style.left = ''; b.style.top = ''; b.style.removeProperty('--tail'); return; }
      const w = window.innerWidth, h = window.innerHeight, bw = b.offsetWidth, bh = b.offsetHeight;
      const sx = (ndc.x * 0.5 + 0.5) * w, sy = (-ndc.y * 0.5 + 0.5) * h;
      const left = Math.min(Math.max(sx - 40, 14), w - bw - 14 - (this.panelOpen ? $('panel').offsetWidth + 16 : 0));
      const top = Math.min(Math.max(sy - bh - 18, 86), h - bh - 130);
      const L = Math.round(left), T = Math.round(top);
      if (L === this.bx && T === this.by) return;
      this.bx = L; this.by = T;
      b.style.left = `${L}px`;
      b.style.top = `${T}px`;
      b.style.setProperty('--tail', `${Math.round(Math.min(Math.max(sx - left, 24), bw - 24))}px`);
    },

    // ---------- Overlays ----------
    hideIntro() { const el = $('intro'); el.classList.add('fade-out'); setTimeout(() => { el.hidden = true; }, 500); },

    celebrate({ title, body, button }) {
      $('celebrateTitle').textContent = title;
      $('celebrateBody').textContent = body;
      $('celebrateBtn').textContent = button;
      this.show('celebrate', true);
      return new Promise((res) => { $('celebrateBtn').onclick = () => { Audio.play('click'); this.show('celebrate', false); res(); }; });
    },

    runQuiz(questions, { onAnswer }) {
      return new Promise((resolve) => {
        let i = 0, score = 0;
        const box = $('quizBody');
        const render = () => {
          const q = questions[i];
          $('quizProgress').textContent = `Question ${i + 1} of ${questions.length}`;
          box.innerHTML = '';
          const h = document.createElement('h3'); h.textContent = q.q; box.appendChild(h);
          const list = document.createElement('div'); list.className = 'quiz-options'; box.appendChild(list);
          const fb = document.createElement('p'); fb.className = 'quiz-feedback'; fb.hidden = true;
          const next = document.createElement('button'); next.className = 'btn btn-hire'; next.hidden = true;
          next.textContent = i < questions.length - 1 ? 'Next question ▸' : 'See my score ▸';
          q.options.forEach((o) => {
            const b = document.createElement('button');
            b.className = 'quiz-option'; b.textContent = o.t;
            b.onclick = () => {
              list.querySelectorAll('button').forEach((x) => { x.disabled = true; });
              b.classList.add(o.ok ? 'right' : 'wrong');
              if (!o.ok) list.querySelectorAll('button').forEach((x, k) => { if (q.options[k].ok) x.classList.add('right'); });
              if (o.ok) score++;
              Audio.play(o.ok ? 'correct' : 'wrong');
              onAnswer(o.ok);
              fb.innerHTML = `<b>${o.ok ? 'Correct!' : 'Not quite.'}</b> ${q.explain}`;
              fb.hidden = false; next.hidden = false; next.focus();
            };
            list.appendChild(b);
          });
          box.appendChild(fb); box.appendChild(next);
          next.onclick = () => { Audio.play('click'); i++; if (i < questions.length) render(); else end(); };
        };
        const end = () => {
          $('quizProgress').textContent = 'Results';
          box.innerHTML = `<div class="quiz-score">${score} / ${questions.length}</div><p>${score === questions.length ? 'Perfect! You can spot diminishing marginal returns from orbit.' : 'Have another look at the chart, then try again.'}</p>`;
          const row = document.createElement('div'); row.className = 'quiz-actions';
          const again = document.createElement('button'); again.className = 'btn btn-quiz'; again.textContent = 'Play again ↺'; again.onclick = () => window.location.reload();
          const close = document.createElement('button'); close.className = 'btn btn-hire'; close.textContent = 'Keep exploring'; close.onclick = () => { Audio.play('click'); this.show('quiz', false); };
          row.append(again, close); box.appendChild(row);
          resolve(score);
        };
        this.show('quiz', true);
        render();
      });
    },
  };

  CK.UI = UI;
})(window.CK = window.CK || {});
