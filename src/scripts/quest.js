// 퀘스트 페이지 (pages/quest.astro)
// 왼쪽: 메인/서브 탭, 맵 선택, 목록(메인은 진행 순서 또는 맵별 묶음, 묶음은 펴고 접기)
// 오른쪽: 고른 퀘스트의 진행률, 시작 NPC·위치, 선행 퀘스트, 보상, 단계별 목표·위치·대사
const MEDIA = 'https://media.dsrwiki.com/dsrwiki';
const DATA_URL = 'https://media.dsrwiki.com/data/csv/quest.json';
const KIND = { main: '메인', sub: '서브' };
const HOW = { AutoStart: '이전 퀘스트 완료 시 자동 시작', UseItem: '아이템 사용으로 시작', NONE: 'NPC에게 받기' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 맵 이미지 주소: 층이 나뉜 맵·이름이 다른 맵은 데이터의 img, 아니면 맵 이름(공백 제거).webp
const mapUrl = (p) => `${MEDIA}/map/${encodeURIComponent(p.img || p.map.replace(/\s+/g, '') + '.webp')}`;
const pin = (pos) => (pos ? `<i style="left:${pos[0] * 100}%;top:${pos[1] * 100}%"></i>` : '');

// 맵 이미지 위에 핑 (pos = 맵 이미지 기준 0~1). 누르면 크게 보기
const mini = (p) => {
  if (!p || !p.map) return '';
  const url = mapUrl(p);
  return `<div class="qp-mini" title="크게 보기" data-url="${esc(url)}" data-name="${esc(p.map)}" data-pos="${p.pos ? p.pos.join(',') : ''}" style="background-image:url('${url}')">${pin(p.pos)}</div>`;
};

// 맵 크게 보기 (화면 아무 곳이나 누르거나 Esc 로 닫기)
function openZoom(el, signal) {
  const pos = el.dataset.pos ? el.dataset.pos.split(',').map(Number) : null;
  const box = document.createElement('div');
  box.className = 'qp-zoom';
  box.innerHTML = `<div class="box"><img src="${esc(el.dataset.url)}" alt="">${pin(pos)}<div class="cap">${esc(el.dataset.name)}</div></div>`;
  const ctl = new AbortController();
  const close = () => { box.remove(); ctl.abort(); };
  box.addEventListener('click', close, { signal: ctl.signal });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), { signal: ctl.signal });
  signal.addEventListener('abort', close, { signal: ctl.signal }); // 다른 페이지로 옮기면 닫음
  document.body.append(box);
}

// 보상 칩. 개발 서버에서는 media 에 없는 아이템 이미지를 로컬 이미지(/__local/item/<id>.webp)으로 대신 보여 줌
const itemImg = (it) => {
  const fallback = import.meta.env.DEV
    ? `data-local="/__local/item/${it.id}.webp" onerror="if(this.dataset.local){this.src=this.dataset.local;this.dataset.local=''}else{this.style.visibility='hidden'}"`
    : `onerror="this.style.visibility='hidden'"`;
  return `<img src="${MEDIA}/item/${encodeURIComponent(it.name)}.webp" alt="" loading="lazy" ${fallback}>`;
};
const chips = (rw) => {
  if (!rw) return '';
  const out = [];
  if (rw.exp) out.push(`<span class="qp-chip plain">EXP ${rw.exp.toLocaleString()}</span>`);
  if (rw.bit) out.push(`<span class="qp-chip plain">${rw.bit.toLocaleString()} BIT</span>`);
  for (const it of rw.items || []) out.push(`<span class="qp-chip">${itemImg(it)}${esc(it.name)} ×${it.count}</span>`);
  return out.length ? `<div class="qp-rw">${out.join('')}</div>` : '';
};

// 단계 목표: 잡을 몹·모을 아이템·이길 전투 (초상화/아이템 그림 + 이름 + 개수)
const GOAL = { mob: '처치', item: '획득', use: '사용', battle: '전투' };
const face = (name) => {
  // [돌연변이]가지몬 처럼 앞에 [..] 가 붙은 몹은 원래 디지몬(가지몬) 그림을 씀
  const f = encodeURIComponent(name.replace(/^\s*\[[^\]]*\]\s*/, '').replace(/:/g, '_'));
  return `<img class="face" src="${MEDIA}/digimon/${f}/${f}.webp" alt="" loading="lazy" onerror="this.onerror=null;this.src='${MEDIA}/digimon/default.webp'">`;
};
const goal = (g) => {
  if (!g) return '';
  const isItem = g.kind === 'item' || g.kind === 'use';
  const list = g.list.map((x) => `<span class="qp-chip">${isItem ? itemImg(x) : face(x.name)}${esc(x.name)}${x.level ? `<small>Lv.${x.level}</small>` : ''}${x.count > 1 || g.kind !== 'battle' ? ` ×${x.count}` : ''}</span>`).join('');
  const extra = [g.from ? `${esc(g.from)}에게서` : '', g.times > 1 ? `${g.times}회` : ''].filter(Boolean).join(' · ');
  return `<div class="qp-goal"><b>${GOAL[g.kind]}</b>${list}${extra ? `<span class="ex">${extra}</span>` : ''}</div>`;
};

// 아이템으로 시작하는 퀘스트: 진행 단계 앞에 '시작 아이템 얻기 → 사용하기' 단계를 붙임
// (프랍·퀘스트 보상으로 얻는 경우는 얻는 곳도 보여 줌. 그 밖에는 사용 단계만)
const startSteps = (q) => {
  const sb = q.startBy;
  if (!sb?.item?.name) return [];
  const it = esc(sb.item.name);
  const out = [];
  const src = sb.from || [];
  src.forEach((s, i) => {
    const alt = src.length > 1 ? `<span class="qp-alt">택1 · ${i + 1}/${src.length}</span>` : '';
    if (s.kind === 'prop') {
      out.push({
        text: `「${esc(s.name)}」 조사해서 「${it}」 얻기${alt}`,
        sub: `${s.place?.map ? `<span>📍 ${esc(s.place.map)}</span>` : ''}${s.after ? `<span>「${esc(s.after.title)}」의 「${esc(s.after.task)}」 단계를 마치면 나타남</span>` : ''}`,
        goal: { kind: 'item', list: [{ ...sb.item, count: 1 }] },
        place: s.place,
      });
    } else if (s.kind === 'mob') {
      out.push({
        text: `「${esc(s.name)}」 처치해서 「${it}」 얻기${alt}`,
        sub: s.place?.map ? `<span>📍 ${esc(s.place.map)}</span>` : '',
        goal: { kind: 'item', list: [{ ...sb.item, count: 1 }], from: s.name },
        place: s.place,
      });
    } else if (s.kind === 'quest') {
      out.push({ text: `「${esc(s.title)}」 퀘스트에서 「${it}」 받기${alt}`, sub: s.task ? `<span>「${esc(s.task)}」 단계 보상</span>` : '', goal: { kind: 'item', list: [{ ...sb.item, count: 1 }] } });
    }
  });
  out.push({ text: `「${it}」 사용하기`, goal: { kind: 'use', list: [{ ...sb.item, count: 1 }] } });
  return out;
};

// 대사: NPC 대사 + 플레이어 선택지, 안내 문구
const lines = (arr) => arr.map((l) => `<div class="qp-line${l.guide ? ' guide' : ''}"><span class="who">${esc(l.who || '???')}</span>${esc(l.text)}${
  l.choices ? `<div class="qp-choices">${l.choices.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}</div>`).join('');

export async function init(signal) {
  const list = document.getElementById('qp-list');
  const detail = document.getElementById('qp-detail');
  const mapSel = document.getElementById('qp-map');
  const viewBox = document.getElementById('qp-view');
  const tabs = document.querySelectorAll('.qp-tabs button');

  const url = import.meta.env.DEV ? '/__local/quest.json' : DATA_URL;
  const data = await fetch(url, { cache: 'no-cache', signal }).then((r) => r.json());
  const byId = new Map(data.quests.map((q) => [q.id, q]));

  let kind = 'main';
  let current = null;
  let mapFilter = '';
  let mainView = 'order'; // 메인 탭 보기: 진행 순서(한 줄로) / 맵별(맵 묶음)
  // 펼친 맵 묶음 (탭마다). 처음에는 선택된 퀘스트가 있는 맵만 펼침
  const opened = { main: new Set(), sub: new Set() };

  function renderMapSelect() {
    const qs = data.quests.filter((q) => q.kind === kind);
    const cnt = {};
    qs.forEach((q) => (cnt[q.mapName] = (cnt[q.mapName] || 0) + 1));
    if (mapFilter && !cnt[mapFilter]) mapFilter = '';
    mapSel.innerHTML = `<option value="">전체 맵 (${qs.length})</option>` + data.maps.filter((m) => cnt[m])
      .map((m) => `<option value="${esc(m)}"${m === mapFilter ? ' selected' : ''}>${esc(m)} (${cnt[m]})</option>`).join('');
  }

  function renderList() {
    viewBox.hidden = kind !== 'main';
    const qs = data.quests.filter((q) => q.kind === kind && (!mapFilter || q.mapName === mapFilter));
    if (kind === 'main' && mainView === 'order') {
      qs.sort((a, b) => a.order - b.order);
      if (!qs.some((q) => q.id === current) && qs[0]) current = qs[0].id;
      list.innerHTML = qs.map((q) => `<li data-id="${q.id}" class="${current === q.id ? 'on' : ''}">
        <span class="qp-num">${q.order}</span>
        <span class="t">${esc(q.title)}</span>
        <span class="m">진행률 ${q.progress}% · ${esc(q.mapName)}<div class="qp-bar"><i style="width:${q.progress}%"></i></div></span></li>`).join('');
      if (current) select(current);
      return;
    }
    // 맵 순서대로 묶음 (메인은 묶음 안에서 진행 순서 유지)
    const groups = new Map(data.maps.map((m) => [m, []]));
    qs.forEach((q) => groups.get(q.mapName)?.push(q));
    const ordered = [...groups.values()].flat();
    if (!ordered.some((q) => q.id === current) && ordered[0]) current = ordered[0].id;
    const cur = byId.get(current);
    const isOpen = (m) => opened[kind].has(m) || mapFilter === m || (!opened[kind].size && cur?.mapName === m && cur.kind === kind);
    const item = (q, m) => `<li data-id="${q.id}" data-map="${esc(m)}" class="${current === q.id ? 'on' : ''}${q.kind === 'main' ? '' : ' nonum'}${isOpen(m) ? '' : ' hide'}">
      ${q.kind === 'main' ? `<span class="qp-num">${q.order}</span>` : ''}
      <span class="t">${esc(q.title)}</span>
      <span class="m">${q.kind === 'main' ? `진행률 ${q.progress}%<div class="qp-bar"><i style="width:${q.progress}%"></i></div>` : esc(q.start.npc?.name || '')}</span></li>`;
    list.innerHTML = [...groups].filter(([, a]) => a.length).map(([m, a]) =>
      `<li class="qp-group${isOpen(m) ? '' : ' closed'}" data-group="${esc(m)}"><span class="arr">▼</span>${esc(m)} · ${a.length}</li>` + a.map((q) => item(q, m)).join('')).join('');
    if (current) select(current);
  }

  function select(id) {
    current = id;
    list.querySelectorAll('li').forEach((li) => li.classList.toggle('on', li.dataset.id === id));
    const q = byId.get(id);
    if (!q) return;
    history.replaceState(history.state, '', `#q${id}`);
    const startPlace = q.start.npc?.place || q.start.place;
    const pre = startSteps(q);
    detail.innerHTML = `
      <div class="qp-badges"><span class="qp-badge ${q.kind}">${KIND[q.kind]}</span><span class="qp-badge">📍 ${esc(q.mapName)}</span>${q.level > 1 ? `<span class="qp-badge">Lv.${q.level} 이상</span>` : ''}${q.repeat ? `<span class="qp-badge">반복 ${esc(q.repeat)}</span>` : ''}</div>
      <div class="qp-title">${q.kind === 'main' ? q.order + '. ' : ''}${esc(q.title)}</div>
      ${q.kind === 'main' ? `<div class="qp-prog"><div class="qp-bar"><i style="width:${q.progress}%"></i></div><span>메인 퀘스트 ${q.order} / ${data.mainTotal} · 진행률 ${q.progress}%</span></div>` : ''}
      <div class="qp-meta">
        <div class="qp-box"><b>시작</b>${q.start.npc ? esc(q.start.npc.name) : esc(HOW[q.startEvent] || '')}${startPlace?.map ? `<div class="qp-place">${esc(startPlace.map)}</div>` : ''}</div>
        <div class="qp-box"><b>선행 퀘스트</b>${q.requires ? esc(q.requires.title) : '없음'}</div>
        <div class="qp-box"><b>총 보상</b>${chips({ ...q.total, items: q.totalItems }) || '없음'}</div>
      </div>
      ${startPlace?.pos ? `<div class="qp-loc">${mini(startPlace)}</div>` : ''}
      <div class="qp-h2">진행 단계</div>
      <ol class="qp-steps">${pre.map((p, i) => `
        <li class="qp-step pre" data-n="${i + 1}">
          <div class="obj">${p.text}<span class="qp-alt pre">시작 전</span></div>
          ${p.sub ? `<div class="sub">${p.sub}</div>` : ''}
          ${p.goal ? goal(p.goal) : ''}
          ${p.place?.pos ? mini(p.place) : ''}
        </li>`).join('')}${q.tasks.map((t, i) => `
        <li class="qp-step${t.branch > 1 ? ' alt' : ''}" data-n="${pre.length + i + 1}">
          <div class="obj">${esc(t.text)}${t.count ? ` (${t.count})` : ''}${t.branchOf ? `<span class="qp-alt">택1 · ${t.branch}/${t.branchOf}</span>` : ''}</div>
          <div class="sub">${t.place?.map ? `<span>📍 ${esc(t.place.map)}</span>` : ''}${t.npc ? `<span>💬 ${esc(t.npc.name)}</span>` : ''}</div>
          ${goal(t.goal)}
          ${t.place?.pos ? mini(t.place) : ''}
          ${chips(t.rewards)}
          ${t.start || t.end ? `<details class="qp-dlg"><summary>대사 보기</summary><div class="qp-lines">${t.start ? lines(t.start) : ''}${t.end ? lines(t.end) : ''}</div></details>` : ''}
        </li>`).join('')}</ol>`;
  }

  // 고른 퀘스트가 목록 가운데 오게 (목록 안에서만 스크롤, 페이지는 그대로)
  function centerSelected() {
    const li = list.querySelector('li.on');
    if (li) list.scrollTop = li.offsetTop - list.clientHeight / 2 + li.offsetHeight / 2;
  }

  function setKind(k) {
    kind = k;
    tabs.forEach((x) => x.classList.toggle('on', x.dataset.kind === k));
    renderMapSelect();
    renderList();
  }

  tabs.forEach((b) => b.addEventListener('click', () => { setKind(b.dataset.kind); list.scrollTop = 0; }, { signal }));
  viewBox.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mainView = b.dataset.view;
    viewBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
    centerSelected();
  }, { signal });
  detail.addEventListener('click', (e) => {
    const m = e.target.closest('.qp-mini');
    if (m) openZoom(m, signal);
  }, { signal });
  mapSel.addEventListener('change',() => { mapFilter = mapSel.value; renderList(); list.scrollTop = 0; }, { signal });
  list.addEventListener('click', (e) => {
    const g = e.target.closest('li.qp-group');
    if (g) {
      const m = g.dataset.group;
      const set = opened[kind];
      list.querySelectorAll('li.qp-group:not(.closed)').forEach((x) => set.add(x.dataset.group)); // 처음 펼쳐져 있던 묶음도 기억
      const close = !g.classList.contains('closed');
      close ? set.delete(m) : set.add(m);
      g.classList.toggle('closed', close);
      list.querySelectorAll(`li[data-map="${CSS.escape(m)}"]`).forEach((li) => li.classList.toggle('hide', close));
      return;
    }
    const li = e.target.closest('li[data-id]');
    if (li) select(li.dataset.id);
  }, { signal });

  // 주소의 #q<퀘스트 번호> 로 바로 열기 (공유용)
  const fromHash = byId.get(location.hash.replace(/^#q/, ''));
  if (fromHash) current = fromHash.id;
  setKind(fromHash ? fromHash.kind : 'main');
  centerSelected();
}
