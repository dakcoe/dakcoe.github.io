'use strict';

const SRC = {
  hackernews: ['Hacker News', 'var(--hn)'], geeknews: ['GeekNews', 'var(--gn)'],
  devto: ['dev.to', 'var(--devto)'], github: ['GitHub Trending', 'var(--gh)'],
  lobsters: ['Lobsters', 'var(--lob)'], rss: ['RSS', 'var(--pri)']
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const status = $('#status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- GitHub 패널 ---------- */
// 기여 잔디는 GraphQL 이라 토큰 없이는 못 부른다. 빌드 때 구워 둔 값을 쓰고,
// 저장소 수만 공개 REST 로 갱신한다.
async function boot() {
  let gh;
  try { gh = await (await fetch('assets/data/github.json')).json(); } catch { return; }
  $('#ghRepos').textContent = gh.public_repos;
  $('#ghJoined').textContent = gh.joined.slice(0, 4);
  $('#heatRange').textContent = gh.from + ' – ' + gh.to;

  const heat = $('#heat'), frag = document.createDocumentFragment();
  for (const week of gh.weeks) {
    const col = document.createElement('span');
    for (const n of week) {
      const c = document.createElement('i');
      c.style.background = n === 0 ? '#efedfd' : n < 4 ? '#cfc7f5' : n < 10 ? '#a99ceb' : n < 20 ? '#7c6ee6' : '#5b4fd0';
      c.title = n + '회';
      col.appendChild(c);
    }
    frag.appendChild(col);
  }
  heat.appendChild(frag);

  try {
    const live = await (await fetch('https://api.github.com/users/dakcoe')).json();
    if (typeof live.public_repos === 'number') $('#ghRepos').textContent = live.public_repos;
  } catch { /* 실패하면 구워 둔 값 그대로 */ }
}

/* ---------- dev-news 기사 ---------- */
async function loadArticles() {
  const now = new Date();
  const month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  try {
    const rows = await (await fetch('https://dev-news.net/data/search-index-' + month + '.json')).json();
    const seen = new Set(), out = [];
    for (const a of rows) {
      const t = (a.t || '').trim();
      if (!t || seen.has(t) || t.length < 16 || t.length > 58) continue;
      seen.add(t);
      out.push({ t, s: a.s || 'rss', d: a.d || '', u: a.u || '' });
    }
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return { items: out, total: rows.length, live: true };
  } catch {
    const rows = await (await fetch('assets/data/cards-fallback.json')).json();
    return { items: rows.map(a => ({ t: a.t, s: a.s, d: a.d, u: '' })), total: rows.length, live: false };
  }
}

/* ---------- dev-news 뷰 (matter-js) ---------- */
const WALL = 0x0001, ATTACHED = 0x0002, LIVE = 0x0004;

class NewsView {
  constructor(data) {
    this.data = data;
    this.grid = $('#grid');
    this.built = false;
  }

  open() {
    $('#newsView').hidden = false;
    if (!this.built) { this.built = true; this.build(); }
    status.textContent = '카드를 훑으면 떨어져 쌓입니다. 끌어서 옮길 수도 있습니다. Esc로 닫습니다.';
  }

  close() {
    $('#newsView').hidden = true;
    status.textContent = '한 화면에 다 있습니다.';
  }

  build() {
    const { Engine, Runner, Bodies, Composite, Body, Events, Mouse, MouseConstraint } = Matter;
    const r = this.grid.getBoundingClientRect();
    const W = this.W = r.width, H = this.H = r.height;

    const cols = W < 700 ? 2 : W < 1000 ? 4 : 6;
    const pad = W < 700 ? 14 : 40, gap = 12;
    const cw = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
    const ch = W < 700 ? 92 : 108;
    // 격자는 위쪽에만 둔다. 아래를 비워야 떨어지는 게 보인다.
    const rows = Math.max(2, Math.min(4, Math.floor((H * 0.55) / (ch + gap))));
    const items = this.data.items.slice(0, cols * rows);

    const engine = this.engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1.3;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;

    const wallOpt = { isStatic: true, collisionFilter: { category: WALL, mask: LIVE }, friction: .6 };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + 60, W * 2, 120, wallOpt),
      Bodies.rectangle(-60, H / 2, 120, H * 3, wallOpt),
      Bodies.rectangle(W + 60, H / 2, 120, H * 3, wallOpt)
    ]);

    const frag = document.createDocumentFragment();
    this.cards = items.map((d, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const el = document.createElement(d.u ? 'a' : 'div');
      el.className = 'card';
      if (d.u) { el.href = d.u; el.target = '_blank'; el.rel = 'noopener'; }
      const [name, color] = SRC[d.s] || SRC.rss;
      el.innerHTML = '<span class="t"></span><span class="s"><b></b><span></span></span>';
      $('.t', el).textContent = d.t;
      const b = $('.s b', el); b.textContent = name; b.style.color = color;
      $('.s span', el).textContent = d.d;
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      frag.appendChild(el);

      const hx = pad + col * (cw + gap) + cw / 2;
      const hy = 10 + row * (ch + gap) + ch / 2;
      // 동적으로 만든 뒤에 정적으로 바꾼다. 생성 옵션으로 isStatic 을 주면
      // matter 가 원래 질량·관성을 보관하지 않아, 나중에 되돌려도 질량이
      // 무한대로 남고 충돌 계산이 0 으로 나눠져 NaN 이 된다.
      // 센서는 쓰지 않는다. matter 는 두 몸이 처음 만날 때 센서 여부를 쌍에
      // 캐시하고 다시 계산하지 않아서, 붙어 있던 시절에 생긴 쌍이 남으면
      // 카드를 동적으로 바꿔도 그 쌍만 영원히 서로를 통과한다.
      // 대신 마스크 0 으로 아무와도 안 부딪히게 두고, 연쇄는 Query 로 잡는다.
      const body = Bodies.rectangle(hx, hy, cw, ch, {
        chamfer: { radius: 8 },
        restitution: .25, friction: .45, frictionAir: .012,
        collisionFilter: { category: ATTACHED, mask: 0 }
      });
      // 기본값(60)이면 격하게 구르던 카드가 파고든 채로 잠들어 버린다.
      body.sleepThreshold = 130;
      Body.setStatic(body, true);
      body.plugin = { el, home: { x: hx, y: hy }, live: false };
      el.__body = body;
      Composite.add(engine.world, body);
      return body;
    });
    this.grid.appendChild(frag);
    this.draw();

    // 떨어지는 카드가 아직 붙어 있는 카드에 닿으면 그것도 풀린다.
    // 충돌 단계 밖에서 겹침을 직접 물어본다.
    Events.on(engine, 'afterUpdate', () => {
      const attached = this.cards.filter(b => !b.plugin.live);
      if (!attached.length) return;
      const falling = this.cards.filter(b => b.plugin.live && !b.isSleeping);
      for (const f of falling) {
        for (const hit of Matter.Query.collides(f, attached)) {
          const other = hit.bodyA === f ? hit.bodyB : hit.bodyA;
          if (other.plugin && !other.plugin.live) this.release(other);
        }
      }
    });

    const mouse = Mouse.create(this.grid);
    const mc = MouseConstraint.create(engine, {
      mouse, collisionFilter: { mask: LIVE },
      constraint: { stiffness: .2, damping: .1, render: { visible: false } }
    });
    Composite.add(engine.world, mc);
    Events.on(mc, 'startdrag', (e) => e.body && e.body.plugin.el.classList.add('held'));
    Events.on(mc, 'enddrag', (e) => e.body && e.body.plugin.el.classList.remove('held'));

    // 카드 위로 지나가면 격자에서 풀린다. 누를 때는 먼저 풀어 줘야 집을 수 있다.
    this.grid.addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest('.card');
      if (el && el.__body) this.release(el.__body);
    });
    this.grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest && e.target.closest('.card');
      if (el && el.__body) this.release(el.__body);
    }, true);
    this.grid.addEventListener('click', (e) => {
      // 끌고 난 직후의 클릭으로 링크가 열리지 않게 한다.
      if (this.dragged) { e.preventDefault(); this.dragged = false; }
    });
    Events.on(mc, 'enddrag', () => { this.dragged = true; setTimeout(() => { this.dragged = false; }, 300); });

    $('#newsReset').addEventListener('click', () => this.reset());

    if (reduced) { this.draw(); return; }
    this.runner = Runner.create();
    Runner.run(this.runner, engine);
    const tick = () => { this.draw(); this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
  }

  release(body) {
    if (body.plugin.live) return;
    body.plugin.live = true;
    body.collisionFilter.category = LIVE;
    body.collisionFilter.mask = LIVE | WALL;
    Matter.Body.setStatic(body, false);
    // 잠든 몸에는 중력이 안 먹는다. 풀자마자 깨우고, 잠 문턱을 넘길 만큼
    // 속도를 줘야 공중에서 그대로 멈추지 않는다.
    Matter.Sleeping.set(body, false);
    // 위에서 바로 떨어진 카드가 아래 카드와 중심까지 포개지면 분리할 방향이
    // 없어 그대로 굳는다. 풀 때 미세하게 어긋뜨려 그 경우를 없앤다.
    Matter.Body.setPosition(body, {
      x: body.position.x + (Math.random() - .5) * 6,
      y: body.position.y + (Math.random() - .5) * 6
    });
    Matter.Body.setVelocity(body, { x: (Math.random() - .5) * 3, y: 1.6 });
    Matter.Body.setAngularVelocity(body, (Math.random() - .5) * .16);
    Matter.Body.setAngle(body, (Math.random() - .5) * .3);
    body.plugin.el.classList.add('live');
    $('#newsHint').classList.add('gone');
  }

  reset() {
    for (const b of this.cards) {
      b.plugin.live = false;
      b.collisionFilter.category = ATTACHED;
      b.collisionFilter.mask = 0;
      Matter.Body.setStatic(b, true);
      Matter.Body.setAngle(b, 0);
      Matter.Body.setAngularVelocity(b, 0);
      Matter.Body.setVelocity(b, { x: 0, y: 0 });
      Matter.Body.setPosition(b, b.plugin.home);
      b.plugin.el.classList.remove('live', 'held');
    }
    $('#newsHint').classList.remove('gone');
    this.draw();
  }

  draw() {
    for (const b of this.cards) {
      const el = b.plugin.el;
      el.style.transform = 'translate3d(' + (b.position.x - el.offsetWidth / 2) + 'px,' +
        (b.position.y - el.offsetHeight / 2) + 'px,0) rotate(' + b.angle + 'rad)';
    }
  }
}

/* ---------- study-assistant 데모 ---------- */
// 강의 문장은 앱 저장소 docs/screenshot.png 에 쓰인 예시 그대로.
const LECTURE = [
  ['In this course we will cover the fundamentals of computer networks.',
   '이 강의에서는 컴퓨터 네트워크의 기초를 다룹니다.'],
  ['The internet can be described in two ways: as a network of networks,',
   '인터넷은 두 가지로 설명할 수 있습니다. 네트워크들의 네트워크로 보는 관점과,'],
  ['and as an infrastructure that provides services to applications.',
   '애플리케이션에 서비스를 제공하는 인프라로 보는 관점입니다.'],
  ['Routers connect different networks, switches connect devices inside one.',
   '라우터는 서로 다른 네트워크를 잇고, 스위치는 한 네트워크 안의 장치를 잇습니다.']
];

class StudyView {
  constructor() {
    this.win = $('#appwin'); this.stage = $('#simstage'); this.panel = $('#settings');
    this.src = $('#srcPane'); this.trg = $('#trgPane');
    this.timers = []; this.spoken = 0; this.autoTr = true; this.aot = true;
    this.dx = 0; this.dy = 0; this.opacity = 100;
    this.wire();
  }

  open() { $('#studyView').hidden = false; status.textContent = '마이크로 받아쓰기, 톱니로 투명도. Always on Top 을 끄면 뒤 페이지가 앱을 덮습니다.'; }
  close() { this.stop(); this.panel.hidden = true; $('#studyView').hidden = true; status.textContent = '한 화면에 다 있습니다.'; }

  wire() {
    $('#mic').addEventListener('click', () => this.recording ? this.stop() : this.start());
    $('#clearBtn').addEventListener('click', () => {
      this.stop(); this.spoken = 0; this.src.textContent = ''; this.trg.textContent = '';
    });
    $('#saveBtn').addEventListener('click', (e) => {
      const b = e.currentTarget, was = b.textContent;
      b.textContent = this.spoken === 0 ? '받아쓴 게 없습니다' : '저장됨';
      setTimeout(() => { b.textContent = was; }, 1200);
    });

    for (const sw of $$('[data-sw]')) sw.addEventListener('click', () => {
      const key = sw.dataset.sw;
      sw.classList.toggle('on');
      if (key === 'auto') {
        this.autoTr = sw.classList.contains('on');
        if (!this.autoTr) this.trg.textContent = ''; else this.redraw();
        return;
      }
      const on = sw.classList.contains('on');
      for (const o of $$('[data-sw="top"],[data-sw="top2"]')) o.classList.toggle('on', on);
      this.aot = on;
      if (on) this.win.classList.remove('behind');
    });

    const chips = $$('[data-lang]');
    for (const c of chips) c.addEventListener('click', () => {
      chips.forEach(o => o.classList.remove('on')); c.classList.add('on');
    });

    $('#gear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden) this.placePanel();
    });

    const range = $('#opRange');
    range.addEventListener('input', () => this.setOpacity(Number(range.value)));
    for (const b of $$('[data-op]')) b.addEventListener('click', () => {
      this.setOpacity(this.opacity + (b.dataset.op === '+' ? 10 : -10));
    });

    const POS = { tl: [-9e3, -9e3], tr: [9e3, -9e3], c: [0, 0], bl: [-9e3, 9e3], br: [9e3, 9e3] };
    for (const b of $$('[data-pos]')) b.addEventListener('click', () => {
      $$('[data-pos]').forEach(o => o.classList.remove('on')); b.classList.add('on');
      const p = POS[b.dataset.pos];
      if (b.dataset.pos === 'c') { this.dx = 0; this.dy = 0; this.apply(); } else this.move(p[0], p[1]);
    });

    $('#apptitle').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      this.drag = { sx: e.clientX, sy: e.clientY, dx: this.dx, dy: this.dy };
      this.win.classList.add('moving');
    });
    addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.move(this.drag.dx + (e.clientX - this.drag.sx), this.drag.dy + (e.clientY - this.drag.sy));
    }, { passive: true });
    addEventListener('pointerup', () => {
      if (!this.drag) return;
      this.drag = null; this.win.classList.remove('moving');
    }, { passive: true });

    // Always on Top 이 꺼져 있을 때만 뒤 페이지가 앱을 덮는다.
    $('#bgpage').addEventListener('pointerdown', () => { if (!this.aot) this.win.classList.add('behind'); });
    this.win.addEventListener('pointerdown', () => this.win.classList.remove('behind'));
    addEventListener('resize', () => { this.move(this.dx, this.dy); });
  }

  setOpacity(v) {
    v = Math.max(20, Math.min(100, Math.round(v / 10) * 10));
    this.opacity = v;
    this.win.style.opacity = String(v / 100);
    $('#opVal').textContent = v + '%';
    $('#opRange').value = String(v);
  }

  // 이동량을 무대 경계로 잘라낸다. 버튼이든 드래그든 창이 밖으로 안 나간다.
  move(dx, dy) {
    const sr = this.stage.getBoundingClientRect(), wr = this.win.getBoundingClientRect();
    const minX = sr.left - (wr.left - this.dx), maxX = sr.right - (wr.right - this.dx);
    const minY = sr.top - (wr.top - this.dy), maxY = sr.bottom - (wr.bottom - this.dy);
    this.dx = minX > maxX ? (minX + maxX) / 2 : Math.max(minX, Math.min(maxX, dx));
    this.dy = minY > maxY ? (minY + maxY) / 2 : Math.max(minY, Math.min(maxY, dy));
    this.apply();
  }

  apply() {
    this.win.style.transform = 'translate(' + Math.round(this.dx) + 'px,' + Math.round(this.dy) + 'px)';
    if (!this.panel.hidden) this.placePanel();
  }

  // 창이 반투명해져도 조작은 또렷해야 하므로 패널은 창 밖에 두고 위치만 맞춘다.
  placePanel() {
    const wr = this.win.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
    this.panel.style.left = Math.max(8, Math.round(wr.right - sr.left - this.panel.offsetWidth - 18)) + 'px';
    this.panel.style.top = Math.round(wr.top - sr.top + 52) + 'px';
  }

  start() {
    this.recording = true;
    this.win.classList.add('rec');
    $('#recState').innerHTML = '<i></i>듣는 중';
    const step = () => {
      if (!this.recording) return;
      if (this.spoken >= LECTURE.length) { this.stop(); return; }
      const p = document.createElement('p');
      p.textContent = LECTURE[this.spoken][0];
      this.src.appendChild(p);
      this.spoken++;
      // 실제 앱처럼 번역은 원문이 확정된 뒤 조금 늦게 붙는다
      this.timers.push(setTimeout(() => { if (this.autoTr) this.redraw(); }, 420));
      this.timers.push(setTimeout(step, 1700));
    };
    this.timers.push(setTimeout(step, 500));
  }

  stop() {
    this.recording = false;
    this.win.classList.remove('rec');
    $('#recState').innerHTML = '<i></i>정지';
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  redraw() {
    this.trg.textContent = '';
    for (let i = 0; i < this.spoken; i++) {
      const p = document.createElement('p');
      p.className = 'ko';
      p.textContent = LECTURE[i][1];
      this.trg.appendChild(p);
    }
  }
}

/* ---------- 시작 ---------- */
(async () => {
  boot();
  const study = new StudyView();
  const data = await loadArticles();
  $('#nCount').textContent = data.total;
  $('#newsCaption').textContent = 'dev-news · ' + (data.live ? '오늘 수집분' : '저장된 수집분') + ' ' + data.total + '건에서';
  const news = new NewsView(data);

  $('[data-open="news"]').addEventListener('click', () => news.open());
  $('[data-open="study"]').addEventListener('click', () => study.open());
  for (const b of $$('[data-close]')) b.addEventListener('click', () => { news.close(); study.close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { news.close(); study.close(); } });
})();
