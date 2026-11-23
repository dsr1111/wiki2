// 도감 필터 — 필터 화면만 새로 만들고, 걸러내는 판단은 기존 도감 코드(digimon.js)를 그대로 씀.
//
// 고를 수 있는 항목(진화·타입·속성·효과·필드)은 아래 목록에 있음 → 아이콘을 늘릴 땐 여기에 이름만 추가
// (이미지는 media.dsrwiki.com 의 같은 이름 파일을 씀)
//
// 구성
//  - 늘 보이는 줄: 이름 검색 + 진화 단계 + 타입 + [상세 필터 (n)]
//  - 선택된 조건 칩 줄 + 전체 해제 (아무것도 안 고르면 숨김)
//  - 상세 필터: 속성(스킬/강점/약점 탭, 스킬은 아무/1/2/3스킬), 스킬(전체 공격·캐스팅·HP 소모·스택),
//               효과([도트][CC][회복] + 버프/디버프 아이콘), 필드 — 여러 개 고르면 조합 방식 선택
//  - 모바일: 검색 + [필터 (n)] 버튼만, 누르면 아래에서 올라오는 창
//  - 기존 위키(dsr/frontend/app/digimon-filter.js)에도 같은 내용이 들어 있음 → 고칠 땐 둘 다

import { t, term } from './i18n.js';

// ---------- 고를 수 있는 항목 ----------
const IMG = 'https://media.dsrwiki.com/dsrwiki/';
const EVOLUTIONS = ['성장기', '성숙기', '완전체', '궁극체'];
const TYPES = ['백신', '데이터', '바이러스', '프리', '언노운', 'NO DATA'];
const ATTRS = ['강철', '나무', '흙', '물', '물리', '바람', '불', '빛', '어둠', '얼음', '천둥'];
// 도트·CC 는 "효과" 줄의 [도트] [CC] 버튼 하나로 모두 찾음 → 여기엔 버프·디버프만 (이름 = 데이터의 효과 이름)
const EFFECT_GROUPS = {
  버프: ['공격력 증가', '방어력 증가', '속도 증가', '치명타율 증가', '회피율 증가', '안개 장벽', '만개'],
  디버프: ['방어력 감소', '속도 감소', '연소'],
};
const GROUP_EN = { 버프: 'Buff', 디버프: 'Debuff' };
const FIELDS = ['DA', 'UK', 'DR', 'DS', 'JT', 'ME', 'NSo', 'NSp', 'VB', 'WG'];

export function initFilter(signal) {
  const D = window.DSRDigimon;
  const mount = document.querySelector('.container1');
  if (!mount || !D) return;
  const F = D.filters;

  // 각 항목: key/arg = D.toggle(key, arg) 로 켜고 끄는 조건, on() = 지금 켜져 있는지
  const item = (key, v, extra) => ({ key, arg: v, label: term(v), on: () => F[key].includes(v), ...extra });
  const evolutions = EVOLUTIONS.map((v) => item('evolution', v, { img: `${IMG}${v}.webp` }));
  const types = TYPES.map((v) => item('type', v, { img: `${IMG}${v}.webp` }));
  const attrs = ATTRS;
  const attrImg = (_tab, attr) => `${IMG}${attr}.webp`;
  const effects = Object.entries(EFFECT_GROUPS).flatMap(([group, names]) => names.map((v) => item('effect', v, { group, img: `${IMG}debuff/${v}.webp` })));
  const effectGroups = Object.keys(EFFECT_GROUPS);
  const fields = FIELDS.map((v) => item('field', v, { img: `${IMG}field/${v}.webp` }));

  // ---------- 상태 바꾸기 (digimon.js 의 D.toggle 을 부름) ----------
  const flip = (i) => D.toggle(i.key, i.arg);
  const ui = {
    open: false, // 상세 필터 펼침
    attrTab: 'skill', // skill | strong | weak
    slot: 'any', // any | 1 | 2 | 3
    effectTab: effectGroups[0],
  };
  const attrSelected = (tab, slot, attr) => {
    if (tab === 'strong') return F.strong.includes(attr);
    if (tab === 'weak') return F.weak.includes(attr);
    return slot === 'any' ? F.skillAny.includes(attr) : F[`skill${slot}`].includes(attr);
  };
  const toggleAttr = (tab, slot, attr) => {
    if (tab === 'strong' || tab === 'weak') return D.toggle(tab, attr);
    return D.toggle(slot === 'any' ? 'skillAny' : `skill${slot}`, attr);
  };
  const skillCount = () => F.skillAny.length + F.skill1.length + F.skill2.length + F.skill3.length;
  // 스킬 종류 — 표의 스킬 칸 배경색(전체 공격·캐스팅·HP 소모)과 같은 색 견본을 씀
  const KINDS = [
    ['aoe', t('전체 공격', 'AoE'), 'rgb(220, 248, 248)'],
    ['cast', t('캐스팅', 'Casting'), 'rgb(255, 234, 234)'],
    ['hp', t('HP 소모', 'HP Cost'), 'rgb(230, 255, 230)'],
    ['stack', term('스택'), null, 'https://media.dsrwiki.com/dsrwiki/debuff/스택.webp'],
    ['dot', t('도트', 'DoT')],
    ['cc', 'CC'],
    ['heal', term('회복')],
  ];
  const kindName = (k) => KINDS.find((x) => x[0] === k)?.[1] || k;
  const detailCount = () => skillCount() + F.skillKind.length + F.strong.length + F.weak.length + F.effect.length + F.field.length;
  const totalCount = () => detailCount() + F.evolution.length + F.type.length;

  // ---------- 화면 요소 도우미 ----------
  const h = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.append(c));
    return n;
  };
  const tip = (el, label) => {
    el.addEventListener('mouseenter', (e) => D.showTooltip(e, label));
    el.addEventListener('mousemove', (e) => D.showTooltip(e, label));
    el.addEventListener('mouseleave', () => D.hideTooltip());
    el.setAttribute('aria-label', label);
  };
  // kind: 기존 버튼 모양을 그대로 따름 (skill/strong/weak = 배경 이미지, effect = 동그란 아이콘)
  const iconBtn = ({ img, label, active, onClick, size = 'md', showLabel = false, kind = 'plain' }) => {
    const b = h('button', { type: 'button', class: `fv-icon fv-${size} fv-k-${kind}${active ? ' is-on' : ''}`, 'aria-pressed': String(!!active), onclick: onClick }, [
      h('img', { src: img, alt: '', loading: 'lazy', decoding: 'async' }),
      showLabel ? h('span', { class: 'fv-icon-label', text: label }) : null,
    ]);
    if (!showLabel) tip(b, label);
    return b;
  };
  const segmented = (options, value, onPick, { small = false, label } = {}) =>
    h('div', { class: `fv-seg${small ? ' fv-seg-sm' : ''}`, role: 'group', 'aria-label': label }, options.map(([v, text, badge]) =>
      h('button', { type: 'button', class: v === value ? 'is-on' : '', 'aria-pressed': String(v === value), onclick: () => onPick(v) }, [
        text, badge ? h('span', { class: 'fv-badge', text: String(badge) }) : null,
      ])));

  // ---------- 틀 ----------
  const root = h('section', { class: 'fv', 'aria-label': t('도감 필터', 'Digidex filter') });
  mount.prepend(root);
  const backdrop = h('div', { class: 'fv-backdrop', onclick: () => setOpen(false) });
  document.body.append(backdrop);
  signal.addEventListener('abort', () => { root.remove(); backdrop.remove(); document.documentElement.classList.remove('fv-lock'); });

  const search = h('input', { type: 'search', class: 'fv-search', placeholder: t('디지몬 이름 (쉼표로 여러 개)', 'Digimon name (comma for several)'), 'aria-label': t('디지몬 이름 검색', 'Search Digimon name') });
  search.addEventListener('input', () => {
    D.searchByName(search.value);
    renderStatus();
  });

  const quick = h('div', { class: 'fv-quick' });
  const toggleBtn = h('button', { type: 'button', class: 'fv-more', 'aria-expanded': 'false', onclick: () => setOpen(!ui.open) });
  const bar = h('div', { class: 'fv-bar' }, [search, quick, toggleBtn]);
  const status = h('div', { class: 'fv-status' });
  const panel = h('div', { class: 'fv-panel', id: 'fv-panel' });
  toggleBtn.setAttribute('aria-controls', 'fv-panel');
  root.append(bar, status, panel);

  function setOpen(v) {
    ui.open = v;
    root.classList.toggle('is-open', v);
    backdrop.classList.toggle('is-open', v);
    toggleBtn.setAttribute('aria-expanded', String(v));
    // 모바일에서 아래 창이 열려 있을 땐 뒤 페이지가 스크롤되지 않게
    document.documentElement.classList.toggle('fv-lock', v && matchMedia('(max-width: 768px)').matches);
    renderBar();
    updateApply();
  }

  // ---------- 그리기 ----------
  const quickGroup = (title, list) => h('div', { class: 'fv-quick-group' }, [
    h('span', { class: 'fv-quick-title', text: title }),
    h('div', { class: 'fv-icons' }, list.map((i) => iconBtn({ img: i.img, label: i.label, active: i.on(), onClick: () => { flip(i); render(); } }))),
  ]);

  function renderBar() {
    quick.replaceChildren(quickGroup(t('진화', 'Evolution'), evolutions), quickGroup(t('타입', 'Type'), types));
    const n = detailCount();
    const nAll = totalCount();
    toggleBtn.replaceChildren(
      h('span', { class: 'fv-more-pc', text: ui.open ? t('상세 필터 접기', 'Hide filters') : t('상세 필터', 'More filters') }),
      h('span', { class: 'fv-more-mo', text: t('필터', 'Filter') }),
      h('span', { class: 'fv-badge fv-more-pc', text: n ? String(n) : '' }),
      h('span', { class: 'fv-badge fv-more-mo', text: nAll ? String(nAll) : '' }),
      h('span', { class: 'fv-chevron', 'aria-hidden': 'true' }),
    );
  }

  function visibleRows() {
    const rows = document.querySelectorAll('#characterTable tr');
    let shown = 0;
    rows.forEach((r) => { if (r.style.display !== 'none') shown++; });
    return { shown, total: rows.length };
  }

  function chipsList() {
    const chips = [];
    const add = (text, img, remove, kind = 'plain') => chips.push({ text, img, remove, kind });
    evolutions.filter((i) => i.on()).forEach((i) => add(i.label, i.img, () => flip(i)));
    types.filter((i) => i.on()).forEach((i) => add(i.label, i.img, () => flip(i)));
    F.skillAny.forEach((a) => add(t(`${a} 스킬`, `${term(a)} Skill`), attrImg('skill', a), () => D.toggle('skillAny', a), 'skill'));
    [1, 2, 3].forEach((s) => F[`skill${s}`].forEach((a) => add(t(`${s}스킬 ${a}`, `Skill ${s} ${term(a)}`), attrImg('skill', a), () => D.toggle(`skill${s}`, a), 'skill')));
    F.strong.forEach((a) => add(t(`강점 ${a}`, `Strong ${term(a)}`), attrImg('strong', a), () => D.toggle('strong', a), 'strong'));
    F.weak.forEach((a) => add(t(`약점 ${a}`, `Weak ${term(a)}`), attrImg('weak', a), () => D.toggle('weak', a), 'weak'));
    F.skillKind.forEach((k) => add(t(`${kindName(k)} 스킬`, `${kindName(k)} Skill`), KINDS.find((x) => x[0] === k)?.[3] || null, () => D.toggle('skillKind', k)));
    effects.filter((e) => e.on()).forEach((e) => add(e.label, e.img, () => flip(e), 'effect'));
    fields.filter((f) => f.on()).forEach((f) => add(f.label, f.img, () => flip(f)));
    return chips;
  }

  function renderStatus() {
    const chips = chipsList();
    const searching = search.value.trim() !== '';
    status.replaceChildren(
      h('div', { class: 'fv-chips' }, [
        ...chips.map((c) => h('button', { type: 'button', class: 'fv-chip', onclick: () => { c.remove(); render(); }, 'aria-label': t(`${c.text} 조건 빼기`, `Remove ${c.text}`) }, [
          c.img ? h('img', { src: c.img, alt: '', class: `fv-k-${c.kind}` }) : h('span', { class: 'fv-chip-dot', 'aria-hidden': 'true' }), c.text, h('span', { class: 'fv-x', 'aria-hidden': 'true', text: '×' }),
        ])),
        searching && chips.length ? h('span', { class: 'fv-note', text: t('이름 검색 중에는 조건이 잠시 꺼집니다', 'Filters are paused while searching by name') }) : null,
      ]),
      h('div', { class: 'fv-count' }, [
        chips.length || searching ? h('button', { type: 'button', class: 'fv-clear', text: t('전체 해제', 'Clear all'), onclick: () => { search.value = ''; D.reset(); render(); } }) : null,
      ]),
    );
    status.hidden = !chips.length && !searching;
  }

  function renderPanel() {
    // 모바일 아래 창에서는 진화·타입도 이 안에 보여 줌 (위 줄에는 검색과 버튼만)
    const mobileQuick = h('div', { class: 'fv-row fv-only-mo' }, [
      h('div', { class: 'fv-row-head' }, [h('h4', { text: t('진화 · 타입', 'Evolution · Type') })]),
      h('div', { class: 'fv-quick fv-quick-in' }, [quickGroup(t('진화', 'Evolution'), evolutions), quickGroup(t('타입', 'Type'), types)]),
    ]);

    // 속성
    const tabCount = { skill: skillCount(), strong: F.strong.length, weak: F.weak.length };
    const slotCount = { any: F.skillAny.length, 1: F.skill1.length, 2: F.skill2.length, 3: F.skill3.length };
    const attrRow = h('div', { class: 'fv-row' }, [
      h('div', { class: 'fv-row-head' }, [
        h('h4', { text: t('속성', 'Attribute') }),
        segmented([['skill', t('스킬', 'Skill'), tabCount.skill], ['strong', t('강점', 'Strong'), tabCount.strong], ['weak', t('약점', 'Weak'), tabCount.weak]], ui.attrTab, (v) => { ui.attrTab = v; renderPanel(); }, { label: t('속성 종류', 'Attribute kind') }),
        ui.attrTab === 'skill'
          ? segmented([['any', t('아무 스킬', 'Any skill'), slotCount.any], ['1', t('1스킬', 'Skill 1'), slotCount[1]], ['2', t('2스킬', 'Skill 2'), slotCount[2]], ['3', t('3스킬', 'Skill 3'), slotCount[3]]], ui.slot, (v) => { ui.slot = v; renderPanel(); }, { small: true, label: t('스킬 위치', 'Skill slot') })
          : null,
      ]),
      h('div', { class: `fv-icons fv-attr fv-attr-${ui.attrTab}` }, attrs.map((a) => iconBtn({
        img: attrImg(ui.attrTab, a), label: term(a), kind: ui.attrTab, showLabel: true, size: 'sm',
        active: attrSelected(ui.attrTab, ui.slot, a),
        onClick: () => { toggleAttr(ui.attrTab, ui.slot, a); render(); },
      }))),
      h('p', { class: 'fv-hint', text: ui.attrTab === 'skill'
        ? (ui.slot === 'any'
          ? t('그 속성 스킬이 하나라도 있는 디지몬 (변환 가능한 속성 포함)', 'Digimon with at least one skill of that attribute (including convertible attributes)')
          : t(`${ui.slot}번째 스킬이 그 속성인 디지몬 (변환 가능한 속성 포함)`, `Digimon whose skill ${ui.slot} has that attribute (including convertible attributes)`))
        : ui.attrTab === 'strong' ? t('그 속성에 강한 디지몬', 'Digimon strong against that attribute') : t('그 속성에 약한 디지몬', 'Digimon weak to that attribute') }),
    ]);

    // 스킬 종류
    const kindHint = () => {
      const scope = skillCount() ? t(' (위에서 고른 속성 스킬 중에서)', ' (among skills of the attributes picked above)') : '';
      if (F.skillKind.length < 2 || !skillRowPicked) return t(`그런 스킬이 하나라도 있는 디지몬${scope}`, `Digimon with at least one such skill${scope}`);
      const mode = D.getSkillKindMode();
      if (mode === 'same') return t(`스킬 하나가 고른 종류를 모두 가진 디지몬${scope}`, `Digimon with one skill that has all picked kinds${scope}`);
      if (mode === 'any') return t(`고른 종류 중 하나라도 있는 디지몬${scope}`, `Digimon with any of the picked kinds${scope}`);
      return t(`고른 종류가 1·2·3스킬에 나눠서라도 모두 있는 디지몬${scope}`, `Digimon with all picked kinds, even across skills 1·2·3${scope}`);
    };
    // 조합 방식 앞에 무엇을 골랐는지 이름으로 보여 줌: [전체 공격] + [도트]
    const pickedNames = (names) => h('span', { class: 'fv-picked' }, names.flatMap((n, i) => [
      i ? h('span', { class: 'fv-plus', text: '+', 'aria-hidden': 'true' }) : null,
      h('b', { text: n }),
    ]));
    // 버튼 묶음: 스킬 줄(전체 공격·캐스팅·HP 소모·스택) / 효과 줄(도트·CC·회복) — 판단은 같은 "스킬 종류" 조건
    const EFFECT_KINDS = ['dot', 'cc', 'heal'];
    const kindButtons = (list) => h('div', { class: 'fv-kinds' }, list.map(([k, label, color, img]) => {
      const on = F.skillKind.includes(k);
      return h('button', { type: 'button', class: `fv-kind${on ? ' is-on' : ''}`, 'aria-pressed': String(on), onclick: () => { D.toggle('skillKind', k); render(); } }, [
        img ? h('img', { src: img, alt: '', class: 'fv-kind-img' }) : color ? h('span', { class: 'fv-kind-swatch', style: `background:${color}` }) : null,
        label,
      ]);
    }));
    // 여러 개 고르면 조합 방식 (두 줄에서 고른 것을 합쳐서 셈). 스킬 줄에 고른 게 있으면 스킬 줄에, 아니면 효과 줄에 보여 줌
    const skillRowPicked = F.skillKind.some((k) => !EFFECT_KINDS.includes(k));
    const kindMode = () => F.skillKind.length > 1 ? h('div', { class: 'fv-mode' }, [
      pickedNames(F.skillKind.map(kindName)),
      segmented([['all', t('모두 가진 디지몬', 'Has all')], ['same', t('한 스킬이 모두 가진 디지몬', 'One skill has all')], ['any', t('하나라도 있으면', 'Has any')]], D.getSkillKindMode(), (v) => { D.setSkillKindMode(v); render(); }, { small: true, label: t('스킬 조건 조합 방식', 'How to combine skill kinds') }),
    ]) : null;
    const kindRow = h('div', { class: 'fv-row' }, [
      h('div', { class: 'fv-row-head' }, [h('h4', { text: t('스킬', 'Skill') })]),
      kindButtons(KINDS.filter(([k]) => !EFFECT_KINDS.includes(k))),
      skillRowPicked ? kindMode() : null,
      h('p', { class: 'fv-hint', text: kindHint() }),
    ]);

    // 효과
    const effCount = (g) => effects.filter((e) => e.group === g && e.on()).length;
    const shownEffects = effects.filter((e) => e.group === ui.effectTab);
    const all = D.getEffectMatchAll();
    const effectRow = h('div', { class: 'fv-row' }, [
      h('div', { class: 'fv-row-head' }, [
        h('h4', { text: t('효과', 'Effect') }),
        kindButtons(KINDS.filter(([k]) => EFFECT_KINDS.includes(k))),
      ]),
      skillRowPicked ? null : kindMode(),
      h('div', { class: 'fv-row-head fv-sub-head' }, [
        segmented(effectGroups.map((g) => [g, t(g, GROUP_EN[g]), effCount(g)]), ui.effectTab, (v) => { ui.effectTab = v; renderPanel(); }, { label: t('효과 분류', 'Effect group') }),
      ]),
      h('div', { class: 'fv-icons fv-effects' }, shownEffects.map((e) => iconBtn({ img: e.img, label: e.label, active: e.on(), showLabel: true, size: 'sm', kind: 'effect', onClick: () => { flip(e); render(); } }))),
      F.effect.length > 1 ? h('div', { class: 'fv-mode' }, [
        pickedNames(effects.filter((e) => e.on()).map((e) => e.label)),
        segmented([['any', t('하나라도 있으면', 'Has any')], ['all', t('모두 가진 디지몬만', 'Has all')]], all ? 'all' : 'any', (v) => { D.setEffectMatchAll(v === 'all'); render(); }, { small: true, label: t('효과 조합 방식', 'How to combine effects') }),
      ]) : null,
    ]);

    // 필드
    const fieldRow = h('div', { class: 'fv-row' }, [
      h('div', { class: 'fv-row-head' }, [h('h4', { text: t('필드', 'Field') })]),
      h('div', { class: 'fv-icons' }, fields.map((f) => iconBtn({ img: f.img, label: f.label, active: f.on(), showLabel: true, size: 'sm', onClick: () => { flip(f); render(); } }))),
      F.field.length > 1 ? h('div', { class: 'fv-mode' }, [
        pickedNames(fields.filter((f) => f.on()).map((f) => f.label)),
        segmented([['any', t('하나라도 있으면', 'Has any')], ['all', t('모두 가진 디지몬만', 'Has all')]], D.getFieldMatchAll() ? 'all' : 'any', (v) => { D.setFieldMatchAll(v === 'all'); render(); }, { small: true, label: t('필드 조합 방식', 'How to combine fields') }),
      ]) : null,
    ]);

    const sheetHead = h('div', { class: 'fv-sheet-head fv-only-mo' }, [
      h('h3', { text: t('필터', 'Filter') }),
      h('button', { type: 'button', class: 'fv-sheet-close', 'aria-label': t('닫기', 'Close'), text: '×', onclick: () => setOpen(false) }),
    ]);
    const sheetFoot = h('div', { class: 'fv-sheet-foot fv-only-mo' }, [
      h('button', { type: 'button', class: 'fv-clear', text: t('전체 해제', 'Clear all'), onclick: () => { D.reset(); render(); } }),
      h('button', { type: 'button', class: 'fv-apply', onclick: () => setOpen(false) }),
    ]);
    panel.replaceChildren(sheetHead, h('div', { class: 'fv-panel-body' }, [mobileQuick, attrRow, kindRow, effectRow, fieldRow]), sheetFoot);
    updateApply();
  }

  /** 모바일 창 아래 "N개 보기" — 표가 늦게 그려져도 맞는 숫자가 되게 따로 갱신 */
  function updateApply() {
    const btn = panel.querySelector('.fv-apply');
    if (btn) btn.textContent = t(`${visibleRows().shown}개 보기`, `Show ${visibleRows().shown}`);
  }

  function render() {
    renderBar();
    renderStatus();
    renderPanel();
  }

  render();
  // 표가 그려지거나 다시 그려질 때 개수 갱신
  document.addEventListener('digimon:rendered', () => { renderStatus(); updateApply(); }, { signal });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.open && matchMedia('(max-width: 768px)').matches) setOpen(false); }, { signal });
}
