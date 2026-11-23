// 기존 app/digimon.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
import { getDigimonData, initAdminLoader } from './page.js';
import { t, term, isEn, loadNames, digimonName, digimonNameEn, skillName } from './i18n.js';
export function init(signal, onReady) {
// ===== 기존 app/digimon.js =====
(() => {
  // ====================================================
  // 1. 전역 변수 및 필터 상태
  // ====================================================
  const filters = {
    evolution: [],
    type: [],
    skill1: [],
    skill2: [],
    skill3: [],
    strong: [],
    weak: [],
    field: [],
    effect: [],
    // 스킬 위치와 상관없이 "이 속성 스킬이 하나라도 있으면" — 기존 페이지에서는 늘 비어 있어 영향 없음
    skillAny: [],
    // 스킬 종류: aoe 전체 공격 / cast 캐스팅(추가 시전 턴) / hp HP 소모 / stack 스택 / dot 도트 / cc CC / heal 회복
    skillKind: [],
  };
  // 효과를 여러 개 고르면 false: 하나라도 있으면 / true: 모두 가진 디지몬만
  let effectMatchAll = false;
  // 스킬 종류를 여러 개 고르면 any: 하나라도 / all: 모두 (스킬이 달라도 됨) / same: 한 스킬이 모두
  let skillKindMode = 'all';
  // 필드를 여러 개 고르면 false: 하나라도 있으면 / true: 모두 가진 디지몬만
  let fieldMatchAll = false;
  let currentSortState = {
    column: -1,
    direction: 'none' // 'none', 'asc', 'desc'
  };
  let originalRows = []; // 원래 순서를 저장할 배열
  // 표의 줄마다 필터 판단에 쓰는 값을 미리 정리해 둔 것 (필터를 누를 때마다 data-* 글자를 다시 쪼개지 않게)
  let rowModels = [];

  // 전생 토글 (개발 서버 전용): local/calculator.json 의 rebirth (이름 → 전생 Lv50 값, 성숙기·완전체만)
  // 배포 빌드에서는 이 값을 불러오는 코드가 통째로 빠지므로 rebirthStats 는 늘 null
  let rebirthStats = null;
  let rebirthOn = false;
  const REBIRTH_KEY = 'dsrDigimonRebirth';
  // 레벨·HP·SP·힘·지능·수비·저항·속도 칸 (열 번호) 과 데이터의 키
  const STAT_CELLS = [1, 4, 5, 6, 7, 8, 9, 10];
  const STAT_KEYS = ['level', 'hp', 'sp', 'STR', 'INT', 'DEF', 'RES', 'SPD'];
  const NO_VALUE = '—'; // 전생 값이 없는 디지몬 (성장기·궁극체 등)
  // 전생은 최대 레벨(표의 레벨 칸)이 100 인 디지몬만 가능 → 90·60 에서 멈추는 디지몬, 레벨 정보가 없는(0) 디지몬은 '—'
  const REBIRTH_LEVEL = '100';

  function applyRebirth() {
    const on = rebirthOn && !!rebirthStats;
    document.querySelector('.result-table')?.classList.toggle('is-rebirth', on);
    rowModels.forEach((m) => {
      const r = on && m.stats[0] === REBIRTH_LEVEL ? rebirthStats[m.row.dataset.name]?.stats : null;
      STAT_CELLS.forEach((c, i) => {
        const v = !on ? m.stats[i] : r && r[STAT_KEYS[i]] != null ? String(r[STAT_KEYS[i]]) : NO_VALUE;
        const cell = m.row.cells[c];
        if (cell.textContent !== v) cell.textContent = v;
      });
    });
    // 정렬 중이면 바뀐 값으로 다시 정렬
    if (currentSortState.direction !== 'none') applySort();
  }

  // 커스텀 툴팁 표시 함수
  function showCustomTooltip(e, text, isHtml = false) {
    const tooltip = document.getElementById('custom-tooltip');
    const tooltipSpan = tooltip.querySelector('span');
    if (isHtml) {
      tooltipSpan.innerHTML = text;
    } else {
      tooltipSpan.textContent = text;
    }
    tooltip.style.display = 'block';

    // 초기 상태: 화살표 위쪽 (기본값)
    tooltip.classList.remove('flipped');

    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.bottom + 5;

    // 화면 아래쪽을 넘어가는지 확인
    if (top + tooltipRect.height > window.innerHeight) {
      // 툴팁 높이 + 간격(5px) + 화살표 높이(8px) 만큼 위로 이동
      top = rect.top - tooltipRect.height - 13;
      tooltip.classList.add('flipped'); // 위로 뒤집힘 -> 화살표는 아래쪽으로
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;

    if (left + tooltipRect.width > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }

    if (left < 0) {
      tooltip.style.left = '10px';
    }
  }

  function hideCustomTooltip() {
    const tooltip = document.getElementById('custom-tooltip');
    tooltip.style.display = 'none';
  }

  const attributeEffects = {
    cc: {
      강철: "중압",
      흙: "석화",
      물: "침잠",
      물리: "스턴",
      바람: "진공",
      불: "공황",
      빛: "격리",
      어둠: "봉인",
      얼음: "빙결",
      천둥: "마비",
    },
    dot: {
      강철: "파열",
      나무: "중독",
      흙: "질식",
      물: "부식",
      물리: "출혈",
      바람: "열상",
      불: "화상",
      빛: "성흔",
      어둠: "저주",
      얼음: "한기",
      천둥: "감전",
    },
  };

  const ccEffects = new Set(Object.values(attributeEffects.cc));
  const dotEffects = new Set(Object.values(attributeEffects.dot));
  // 스킬 종류 "도트" / "CC" 판단용 — 속성과 상관없는 특수 효과까지 포함 (공백 뺀 이름)
  const allDotEffects = new Set([...dotEffects, "잔류에너지"]);
  const allCcEffects = new Set([...ccEffects, "매료", "혼란", "금속화", "꼭두각시", "영원한잠", "스나이퍼미사일", "감염"]);

  function getEffectForAttribute(effectName, attribute) {
    if (ccEffects.has(effectName)) {
      return attributeEffects.cc[attribute] || effectName;
    }
    if (dotEffects.has(effectName)) {
      return attributeEffects.dot[attribute] || effectName;
    }
    return effectName;
  }

  function getPossibleSkillEffects(effectString, defaultAttribute, changeAttributes, attributeFilters) {
    const effects = (effectString || "")
      .split(',')
      .map((effect) => effect.trim())
      .filter(Boolean);
    const availableAttributes = [defaultAttribute, ...changeAttributes].filter(Boolean);
    const attributes = attributeFilters.length > 0
      ? availableAttributes.filter((attribute) => attributeFilters.includes(attribute))
      : availableAttributes;

    return new Set(
      attributes.flatMap((attribute) =>
        effects.map((effect) =>
          attribute === defaultAttribute ? effect : getEffectForAttribute(effect, attribute)
        )
      )
    );
  }

  function getAttributeForEffectFilter(effectString, defaultAttribute, changeAttributes, effectFilters) {
    if (effectFilters.length === 0) return null;

    const effects = (effectString || "")
      .split(',')
      .map((effect) => effect.trim())
      .filter(Boolean);
    const availableAttributes = [defaultAttribute, ...changeAttributes].filter(Boolean);

    return availableAttributes.find((attribute) =>
      effects.some((effect) => {
        const displayedEffect = attribute === defaultAttribute
          ? effect
          : getEffectForAttribute(effect, attribute);
        return effectFilters.includes(displayedEffect);
      })
    ) || null;
  }

  // 스킬의 CC·도트 효과 아이콘을 보이는 속성에 맞게 바꿈 (예: 열상 → 천둥으로 바꾸면 감전)
  function updateSkillEffectIcons(skill, attribute) {
    skill.effectImgs.forEach((effectImg) => {
      const defaultEffect = effectImg.dataset.defaultEffect;
      const displayedEffect = attribute === skill.attr
        ? defaultEffect
        : getEffectForAttribute(defaultEffect, attribute);

      // 바뀐 것만 씀 (필터를 누를 때마다 371줄 × 아이콘을 전부 다시 쓰지 않게). 툴팁은 alt 를 읽음
      if (effectImg.alt === displayedEffect) return;
      effectImg.src = `https://media.dsrwiki.com/dsrwiki/debuff/${displayedEffect}.webp`;
      effectImg.alt = displayedEffect;
    });
  }

  const splitList = (str, sep) => (str ? str.split(sep).map((v) => v.trim()).filter(Boolean) : []);

  // 표 한 줄 → 필터 판단용 값 (스킬 칸은 13·14·15번째 칸)
  function toRowModel(row) {
    const d = row.dataset;
    return {
      row,
      // 원래 스탯 글자 (전생 토글을 끌 때 되돌릴 값)
      stats: STAT_CELLS.map((c) => row.cells[c].textContent),
      // 검색: 한국어 이름과 영어 이름 둘 다
      name: d.name ? `${d.name} ${digimonNameEn(d.name)}`.toLowerCase() : '',
      evolution: d.evolution,
      type: d.type,
      fields: splitList(d.fields, ';'),
      strong: d.강점 ? d.강점.trim() : '',
      weak: d.약점 ? d.약점.trim() : '',
      skills: [1, 2, 3].map((n) => {
        const cell = row.cells[12 + n];
        return {
          attr: d[`skill${n}Attr`] || '',
          change: splitList(d[`skill${n}Change`], ','),
          effect: d[`skill${n}Effect`],
          kinds: (d[`skill${n}Kind`] || '').split(','),
          img: cell?.querySelector('.main-skill-icon') || null,
          // 속성에 따라 바뀌는 CC·도트 효과 아이콘만
          effectImgs: cell
            ? [...cell.querySelectorAll('.digimon-effect-img[data-default-effect]')].filter((img) =>
              ccEffects.has(img.dataset.defaultEffect) || dotEffects.has(img.dataset.defaultEffect))
            : [],
        };
      }),
    };
  }

  // 스킬 속성 아이콘: 바뀐 것만 씀
  function setSkillIcon(img, attr, glow) {
    if (img.alt !== attr) {
      img.src = `https://media.dsrwiki.com/dsrwiki/${attr}.webp`;
      img.alt = attr;
    }
    if (img.classList.contains('converted-glow') !== glow) img.classList.toggle('converted-glow', glow);
  }

  // 표 안 아이콘의 툴팁: 아이콘마다 onmouseenter 를 붙이지 않고 표에 리스너 하나만 둠
  function initTableTooltips() {
    const table = document.getElementById('characterTable');
    if (!table) return;
    const show = (e) => {
      const img = e.target.closest?.('img');
      if (!img || !table.contains(img)) return;
      if (img.classList.contains('digimon-effect-img')) {
        showEffectTooltip(e, img.alt, img.dataset.digimonName, img.dataset.skillNumber);
      } else if (img.classList.contains('main-skill-icon')) {
        showConvertibleTooltip(e, img.dataset.change || '');
      } else if (img.matches('.digimon-type-img, .digimon-field-img, .bg-strong, .bg-weak')) {
        showCustomTooltip(e, term(img.alt));
      }
    };
    table.addEventListener('mouseover', show, { signal });
    table.addEventListener('mousemove', show, { signal });
    table.addEventListener('mouseout', (e) => {
      const img = e.target.closest?.('img');
      if (img && img !== e.relatedTarget) hideCustomTooltip();
    }, { signal });
  }

  const effectDescriptions = {
    출혈: "* 출혈<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>물리속성에 취약해집니다.<br>힐 받을 경우 해제됩니다.",
    열상: "* 열상<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>흙속성에 취약해집니다.<br>나무속성 피격 시 해제됩니다.",
    저주: "* 저주<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>빛속성에 취약해집니다.<br>천둥속성 피격 시 해제됩니다.",
    질식: "* 질식<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>물리속성에 취약해집니다.<br>강철속성 피격 시 해제됩니다.",
    성흔: "* 성흔<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>얼음속성에 취약해집니다.<br>바람속성 피격 시 해제됩니다.",
    파열: "* 파열<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>나무속성에 취약해집니다.<br>어둠속성 피격 시 해제됩니다.",
    한기: "* 한기<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>천둥속성에 취약해집니다.<br>물속성 피격 시 해제됩니다.",
    부식: "* 부식<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>바람속성에 취약해집니다.<br>흙속성 피격 시 해제됩니다.",
    화상: "* 화상<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>바람속성에 취약해집니다.<br>물속성 피격 시 해제됩니다.",
    중독: "* 중독<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>어둠속성에 취약해집니다.<br>불속성 피격 시 해제됩니다.",
    감전: "* 감전<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>물속성에 취약해집니다.<br>나무속성 피격 시 해제됩니다.",
    봉인: "* 봉인<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>빛속성에 취약해집니다.<br>천둥속성 피격 시 해제됩니다.",
    빙결: "* 빙결<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>천둥속성에 취약해집니다.<br>천둥속성 피격 시 해제됩니다.",
    석화: "* 석화<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>강철속성에 취약해집니다.<br>강철속성 피격 시 해제됩니다.",
    격리: "* 격리<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>얼음속성에 취약해집니다.<br>바람속성 피격 시 해제됩니다.",
    스턴: "* 스턴<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>강철속성에 취약해집니다.<br>빛속성 피격 시 해제됩니다.",
    중압: "* 중압<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>나무속성에 취약해집니다.<br>어둠속성 피격 시 해제됩니다.",
    마비: "* 마비<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>불속성에 취약해집니다.<br>물리속성 피격 시 해제됩니다.",
    침잠: "* 침잠<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>바람속성에 취약해집니다.<br>흙속성 피격 시 해제됩니다.",
    진공: "* 진공<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>흙속성에 취약해집니다.<br>나무속성 피격 시 해제됩니다.",
    공황: "* 공황<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>물속성에 취약해집니다.<br>얼음속성 피격 시 해제됩니다.",
    연소: "* 연소<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 대상의 SP 추가 소모.<br>스킬 레벨에 따라 소모량 증가.",
    매료: "* 매료<br>공격 시 29.5% 확률로 발생됩니다.<br>일정 턴 동안 명령 불가.<br>피아식별 없이 행동.",
    "방어력 감소": "* 방어력 감소<br>공격 시 65% 확률로 발생됩니다.<br>일정 턴 동안 DEF x% 감소",
    "방어력 증가": "* 방어력 증가<br>일정 턴 동안 DEF x% 증가",
    "공격력 증가": "* 공격력 증가<br>일정 턴 동안 STR x% 증가",
    "속도 감소": "* 속도 감소<br>공격 시 65% 확률로 발생됩니다.<br>일정 턴 동안 SPD x% 감소",
    "속도 증가": "* 속도 증가<br>일정 턴 동안 SPD x% 증가",
    "치명타율 증가": "* 치명타율 증가<br>일정 턴 동안 치명타율 x% 증가",
    "회피율 증가": "* 회피율 증가<br>일정 턴 동안 회피율 x% 증가",
    회복: "* 회복",
    혼란: "* 혼란<br>공격 시 29.5% 확률로 발생됩니다.<br>일정 턴 동안 명령 불가.<br>피아식별 없이 행동.",
    금속화: "* 금속화<br>공격 시 25% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가해지며, 턴마다 지속 피해를 입힙니다.<br>불속성에 취약해집니다.<br>나무속성 피격 시 해제됩니다.",
    "잔류 에너지": "* 잔류 에너지<br>공격 시 65% 확률로 발생됩니다.<br>턴마다 지속 피해를 입힙니다.<br>빛속성에 취약해집니다.<br>흙속성 피격 시 해제됩니다.",
    "꼭두각시": "* 꼭두각시<br>공격 시 **% 확률로 발생됩니다.<br>일정 턴 동안 명령이 불가해집니다.<br>피아식별 없이 행동하게 됩니다.<br>빛속성 피격 시 해제됩니다.",
    "안개 장벽": "* 안개 장벽<br>일정 턴 동안 아군 모두에게 DEF x% 증가",
    "영원한 잠": "* 영원한 잠<br>공격 시 18% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가해집니다.<br>물 속성 피격 시 해제됩니다.",
    "만개": "* 만개<br>2턴 동안 매 턴 HP를 261 회복합니다.",
    "스나이퍼 미사일": "* 스나이퍼 미사일<br>공격 시 14% 확률로 발생됩니다.<br>일정 턴 동안 행동 불가.<br>불 속성에 취약해집니다.<br>물리 속성 피격 시 해제됩니다.",
    감염: "* 감염<br>공격 시 30% 확률로 발생합니다.<br>턴마다 지속 피해를 입힙니다.<br>일정 턴 동안 명령이 불가해집니다.<br>피아식별 없이 행동하게 됩니다."
  };

  const DESC_EN = [
    [/공격 시 ([\d.*]+)% 확률로 발생(?:됩니다|합니다)\./, 'Triggers with a $1% chance on attack.'],
    [/턴마다 지속 피해를 입힙니다\./, 'Deals damage every turn.'],
    [/일정 턴 동안 행동 불가해지며, 턴마다 지속 피해를 입힙니다\./, 'Unable to act for some turns and takes damage every turn.'],
    [/일정 턴 동안 행동 불가(?:해집니다)?\./, 'Unable to act for some turns.'],
    [/일정 턴 동안 명령(?:이)? 불가(?:해집니다)?\./, 'Cannot be commanded for some turns.'],
    [/피아식별 없이 행동(?:하게 됩니다)?\./, 'Attacks friend and foe alike.'],
    [/(\S+?) ?속성에 취약해집니다\./, (m, a) => `Becomes vulnerable to ${term(a)}.`],
    [/(\S+?) ?속성 피격 시 해제됩니다\./, (m, a) => `Removed when hit by ${term(a)}.`],
    [/힐 받을 경우 해제됩니다\./, 'Removed when healed.'],
    [/턴마다 대상의 SP 추가 소모\./, 'Target consumes extra SP every turn.'],
    [/스킬 레벨에 따라 소모량 증가\./, 'Consumption increases with skill level.'],
    [/일정 턴 동안 아군 모두에게 DEF x% 증가/, 'All allies DEF +x% for some turns'],
    [/일정 턴 동안 (DEF|SPD|STR) x% 감소/, '$1 -x% for some turns'],
    [/일정 턴 동안 (DEF|SPD|STR) x% 증가/, '$1 +x% for some turns'],
    [/일정 턴 동안 치명타율 x% 증가/, 'Critical Hit Rate +x% for some turns'],
    [/일정 턴 동안 회피율 x% 증가/, 'Evade Rate +x% for some turns'],
    [/(\d+)턴 동안 매 턴 HP를 (\d+) 회복합니다\./, 'Restores $2 HP every turn for $1 turns.'],
  ];
  /** 효과 설명 → 영어 (첫 줄 "* 효과 이름" + 문장들) */
  const descEn = (html) => html.split('<br>').map((line, i) => {
    if (i === 0 && line.startsWith('* ')) return `* ${term(line.slice(2))}`;
    for (const [re, to] of DESC_EN) if (re.test(line)) return line.replace(re, to);
    return line;
  }).join('<br>');
  // 디지몬 전용 스택 설명 (영어)
  const stackEn = (who, kind) => {
    const n = digimonName(who);
    if (who === '황룡몬') return kind === 'gain'
      ? `${n} exclusive stack.<br>Each use of this skill adds 1 '${term('음양')}' stack.<br><br>Up to 3 stacks.`
      : `${n} exclusive stack.<br>With 1/2/3 ${term('음양')} stacks, '${skillName('황회')}' deals 1.4/2.26/3.45x damage.<br><br>Using '${skillName('황회')}' consumes all stacks.`;
    if (who === '벨페몬:레이지모드') return kind === 'gain'
      ? `${n} exclusive stack.<br>Each use of this skill adds 2 '${term('나태의 업화')}' stacks.<br><br>Up to 6 stacks.`
      : `${n} exclusive stack.<br>With 3/5 ${term('나태의 업화')} stacks, '${skillName('기프트 오브 다크네스')}' deals 2.33/3.44x damage.`;
    if (who === '알파몬:왕룡검') return kind === 'gain'
      ? `${n} exclusive stack.<br>Each use of this skill adds 1 '${term('용혼')}' stack.<br><br>Up to 2 stacks.`
      : `${n} exclusive '${term('용혼')}' stack.<br>With 1/2 stacks, '${skillName('디지털라이즈 오브 소울')}' deals 1.72/2.76x damage.<br>Using this skill consumes all ${term('용혼')} stacks.`;
    return null;
  };

  const effectDescriptionsLower = Object.keys(effectDescriptions).reduce(
    (acc, key) => {
      acc[key.toLowerCase()] = effectDescriptions[key];
      return acc;
    },
    {}
  );

  function showEffectTooltip(e, effectName, digimonName, skillNumber) {
    if (!effectName) return;
    const normalizedEffect = effectName.trim().toLowerCase();
    let effectDescription = effectDescriptionsLower[normalizedEffect] || t("효과 설명을 찾을 수 없습니다.", "No description for this effect.");

    const safeDigimonName = digimonName ? digimonName.replace(/:/g, '_') : '';

    let effectImagePath = `https://media.dsrwiki.com/dsrwiki/debuff/${effectName}.webp`;
    if (normalizedEffect === "회복") {
      effectImagePath = `https://media.dsrwiki.com/dsrwiki/digimon/${safeDigimonName}/skill${skillNumber}.webp`;
    } else if (normalizedEffect === "스택 증가") {
      effectImagePath = `https://media.dsrwiki.com/dsrwiki/debuff/스택.webp`;
      if (digimonName === "황룡몬") {
        effectDescription = "황룡몬 전용 스택.<br>해당 스킬을 사용할 때마다 '음양' 스택이 1개씩 쌓입니다.<br><br>스택은 최대 3개까지 쌓을 수 있습니다."; // 황룡몬 스택 증가 설명 입력
      } else if (digimonName === "벨페몬:레이지모드") {
        effectDescription = "벨페몬:레이지모드 전용 스택.<br>해당 스킬을 사용할 때마다 '나태의 업화' 스택이 2개씩 쌓입니다.<br><br>스택은 최대 6개까지 쌓을 수 있습니다.";
      } else if (digimonName === "알파몬:왕룡검") {
        effectDescription = "알파몬:왕룡검 전용 스택.<br>해당 스킬을 사용할 때마다 '용혼' 스택이 1개씩 쌓입니다.<br><br>스택은 최대 2개까지 쌓을 수 있습니다.";
      }
    } else if (normalizedEffect === "스택 소모") {
      effectImagePath = `https://media.dsrwiki.com/dsrwiki/digimon/${safeDigimonName}/stack.webp`;
      if (digimonName === "황룡몬") {
        effectDescription = "황룡몬 전용 스택.<br>황룡몬이 보유한 음양 스택이 1/2/3개 일 때,<br>'황회' 스킬의 대미지가 1.4/2.26/3.45배 증가합니다.<br><br>'황회' 스킬 사용 시 보유 중인 모든 스택을 소모합니다."; // 황룡몬 스택 소모 설명 입력
      } else if (digimonName === "벨페몬:레이지모드") {
        effectDescription = "벨페몬:레이지모드 전용 스택.<br>벨페몬:레이지모드가 보유한 나태의 업화 스택이 3/5개 일 때,<br>'기프트 오브 다크네스' 스킬의 대미지가 2.33/3.44배 증가합니다.";
      } else if (digimonName === "알파몬:왕룡검") {
        effectDescription = "알파몬:왕룡검 전용 '용혼' 스택.<br>보유 스택이 1/2개일 때 '디지털라이즈 오브 소울'의 대미지가 1.72/2.76배가 됩니다.<br>해당 스킬 사용 시 보유 중인 모든 용혼 스택을 소모합니다.";
      }
    }

    if (isEn()) {
      const kind = normalizedEffect === "스택 증가" ? 'gain' : normalizedEffect === "스택 소모" ? 'use' : null;
      effectDescription = (kind && stackEn(digimonName || '', kind)) || descEn(effectDescription);
    }

    const content = `
      <div class="tooltip-content">
        <img loading="lazy" src="${effectImagePath}" alt="${effectName} 이미지" class="tooltip-inner-img" ${normalizedEffect === "스택 소모" ? 'onerror="this.onerror=null;this.src=\'https://media.dsrwiki.com/dsrwiki/debuff/스택.webp\';"' : ''}>
        <div class="tooltip-description">${effectDescription}</div>
      </div>
    `;

    showCustomTooltip(e, content, true);
  }

  function showConvertibleTooltip(e, changeAttrString) {
    const changeAttrs = changeAttrString ? changeAttrString.split(',').map(a => a.trim()).filter(Boolean) : [];
    let content = "";
    if (changeAttrs.length > 0) {
      content = `
        <div class="convertible-tooltip-content" style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: bold; font-size: 14px; color: #fff;">${t('변환 가능 속성:', 'Convertible:')}</span>
          <div style="display: flex; gap: 4px; align-items: center;">
            ${changeAttrs.map(attr => `
              <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/${attr}.webp" alt="${attr}" style="width: 26px; height: 26px; object-fit: contain; vertical-align: middle;">
            `).join('')}
          </div>
        </div>
      `;
    } else {
      content = `
        <div class="convertible-tooltip-content" style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: bold; font-size: 14px; color: #fff;">${t('변환 가능 속성:', 'Convertible:')}</span>
          <span style="font-size: 14px; color: #bbb;">${t('없음', 'None')}</span>
        </div>
      `;
    }
    showCustomTooltip(e, content, true);
  }

  // 표의 스킬 칸 하나 (속성 아이콘 + 효과 아이콘 + 타수/사거리)
  const createSkillHtml = (skill, skillNumber, digimonName) => {
    if (!skill) return "<td></td>";
    let isAoE = skill.target_count === "전체";
    let isCast = !!skill.additionalTurn;
    let isHPCost = !!skill.hpCost;
    let skillClass = "";

    if (isAoE && isCast && isHPCost) {
      skillClass = "skill-bg-mixed-all";
    } else if (isAoE && isCast) {
      skillClass = "skill-bg-mixed-aoe-cast";
    } else if (isAoE && isHPCost) {
      skillClass = "skill-bg-mixed-aoe-hp";
    } else if (isCast && isHPCost) {
      skillClass = "skill-bg-mixed-cast-hp";
    } else if (isHPCost) {
      skillClass = "skill-bg-green";
    } else if (isCast) {
      skillClass = "skill-bg-red";
    } else if (isAoE) {
      skillClass = "skill-bg-blue";
    }

    let effectTooltipHtml = "";
    if (skill.effect) {
      // 콤마로 구분된 여러 효과 처리
      const effects = skill.effect.split(',').map(e => e.trim());

      effectTooltipHtml = effects.map(eff => {
        const normalizedEff = eff.toLowerCase();
        let effectImagePath = `https://media.dsrwiki.com/dsrwiki/debuff/${eff}.webp`;

        if (normalizedEff === "회복") {
          effectImagePath = `https://media.dsrwiki.com/dsrwiki/digimon/${digimonName}/skill${skillNumber}.webp`;
        } else if (normalizedEff === "스택 증가") {
          effectImagePath = `https://media.dsrwiki.com/dsrwiki/debuff/스택.webp`;
        } else if (normalizedEff === "스택 소모") {
          effectImagePath = `https://media.dsrwiki.com/dsrwiki/digimon/${digimonName.replace(/:/g, '_')}/stack.webp`;
        }

        return `<img loading="lazy" src="${effectImagePath}" alt="${eff}" 
            class="digimon-effect-img"
            data-default-effect="${eff}"
            data-digimon-name="${digimonName}"
            data-skill-number="${skillNumber}"
            ${normalizedEff === "스택 소모" ? 'onerror="this.onerror=null;this.src=\'https://media.dsrwiki.com/dsrwiki/debuff/스택.webp\';"' : ''}
            style="margin-right: 2px;"
           >`;
      }).join('');
    }

    const changeAttrString = skill.change && Array.isArray(skill.change) ? skill.change.join(',') : '';

    return `
      <td class="${skillClass}">
        <div style="position: relative; display: inline-block;" class="main-skill-icon-wrapper">
          <img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/${skill.attribute}.webp" alt="${skill.attribute}" 
            class="digimon-attr-img bg-skill main-skill-icon"
            data-default-attr="${skill.attribute}"
            data-change="${changeAttrString}"
          >
        </div>
        ${effectTooltipHtml}
        <span>${skill.hits === '보조' ? term(skill.hits) : t(`${skill.hits}타`, `${skill.hits} Hit${skill.hits == 1 ? '' : 's'}`)} / ${term(skill.range)}${skill.additionalTurn ? ` <span style="font-size: 0.9em; color: gray;">(${skill.additionalTurn})</span>` : ''}</span>
      </td>
    `;
  };

  // 스킬 종류 (전체 공격·캐스팅·HP 소모·스택) — 표 칸 배경색과 같은 기준
  const skillKinds = (skill) => {
    if (!skill) return "";
    const kinds = [];
    if (skill.target_count === "전체") kinds.push("aoe");
    if (skill.additionalTurn) kinds.push("cast");
    if (skill.hpCost) kinds.push("hp");
    const effectNames = (skill.effect || "").split(",").map((e) => e.replace(/\s/g, "")).filter(Boolean);
    if (effectNames.some((e) => e.startsWith("스택"))) kinds.push("stack");
    if (effectNames.some((e) => allDotEffects.has(e))) kinds.push("dot");
    if (effectNames.some((e) => allCcEffects.has(e))) kinds.push("cc");
    if (effectNames.includes("회복")) kinds.push("heal");
    return kinds.join(",");
  };

  // ====================================================
  // 3. TableDataManager Module
  // ====================================================
  const TableDataManager = {
    showLoading() {
      const loadingSpinner = document.getElementById('loading-spinner');
      const resultTable = document.querySelector('.result-table');
      if (loadingSpinner) loadingSpinner.classList.remove('hidden');
      if (resultTable) resultTable.style.display = 'none';
    },

    hideLoading() {
      const loadingSpinner = document.getElementById('loading-spinner');
      const resultTable = document.querySelector('.result-table');
      if (loadingSpinner) loadingSpinner.classList.add('hidden');
      if (resultTable) resultTable.style.display = 'table';
    },

    async fetchData(fresh = false) {
      try {
        // 로딩 표시 시작
        this.showLoading();

        // fresh: 관리자가 저장한 직후에는 브라우저 캐시를 건너뜀
        const [digimonData] = await Promise.all([getDigimonData({ fresh }), loadNames()]);
        if (!digimonData) return;

        const tableBody = document.getElementById("characterTable");
        tableBody.innerHTML = "";

        Object.entries(digimonData).forEach(([name, digimon]) => {
          try {
            if (name === '멧돼지몬') return;
            const evolution = digimon.evolution_stage;
            const type = digimon.type;
            const stats = digimon.stats;
            const strengths = digimon.strengths;
            const weaknesses = digimon.weaknesses;
            const fields = digimon.fields.join(";");

            const typeImagePath = `https://media.dsrwiki.com/dsrwiki/${type}.webp`;
            // 툴팁은 initTableTooltips 가 alt 를 읽어 띄움
            const typeImgHtml = `<img loading="lazy" src="${typeImagePath}" alt="${type}"
              class="digimon-type-img"
            >`;

            const strongHtml = strengths.attribute
              ? `<img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/${strengths.attribute}.webp" alt="${strengths.attribute}"
                  class="digimon-attr-img bg-strong"
                > <span>${term(strengths.effect) || ""}</span>`
              : "";

            const weakHtml = weaknesses.attribute
              ? `<img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/${weaknesses.attribute}.webp" alt="${weaknesses.attribute}"
                  class="digimon-attr-img bg-weak"
                > <span>${term(weaknesses.effect) || ""}</span>`
              : "";

            const fieldsHtml = fields
              ? fields
                .split(";")
                .map(field => field.trim())
                .filter(field => field !== "")
                .map(
                  (field) =>
                    `<img loading="lazy" src="https://media.dsrwiki.com/dsrwiki/field/${field}.webp" alt="${field}" 
                        class="digimon-field-img"
                      >`
                )
                .join("")
              : "";

            // 표시명은 폼몬으로 변경됐지만 기존 CDN 이미지 경로는 유지한다.
            const sanitizedName = (name === "폼몬" ? "포무몬" : name).replace(/[:]/g, "_");
            const characterImagePath = `https://media.dsrwiki.com/dsrwiki/digimon/${sanitizedName}/${sanitizedName}.webp`;

            const newRow = document.createElement("tr");
            newRow.dataset.name = name;
            newRow.dataset.evolution = evolution;
            newRow.dataset.type = type;
            newRow.dataset.level = stats.level;
            newRow.dataset.hp = stats.hp;
            newRow.dataset.sp = stats.sp;
            newRow.dataset.힘 = stats.STR;
            newRow.dataset.지능 = stats.INT;
            newRow.dataset.수비 = stats.DEF;
            newRow.dataset.저항 = stats.RES;
            newRow.dataset.속도 = stats.SPD;
            newRow.dataset.강점 = strengths.attribute;
            newRow.dataset.강점효과 = strengths.effect;
            newRow.dataset.약점 = weaknesses.attribute;
            newRow.dataset.약점효과 = weaknesses.effect;
            newRow.dataset.fields = fields;

            // 스킬 속성 및 변환 데이터 저장
            newRow.dataset.skill1Attr = digimon.skills[0]?.attribute || "";
            newRow.dataset.skill2Attr = digimon.skills[1]?.attribute || "";
            newRow.dataset.skill3Attr = digimon.skills[2]?.attribute || "";
            newRow.dataset.skill1Change = digimon.skills[0]?.change ? digimon.skills[0].change.join(',') : "";
            newRow.dataset.skill2Change = digimon.skills[1]?.change ? digimon.skills[1].change.join(',') : "";
            newRow.dataset.skill3Change = digimon.skills[2]?.change ? digimon.skills[2].change.join(',') : "";

            // 스킬 효과 데이터 저장
            newRow.dataset.skill1Effect = digimon.skills[0]?.effect || "";
            newRow.dataset.skill2Effect = digimon.skills[1]?.effect || "";
            newRow.dataset.skill3Effect = digimon.skills[2]?.effect || "";

            newRow.dataset.skill1Kind = skillKinds(digimon.skills[0]);
            newRow.dataset.skill2Kind = skillKinds(digimon.skills[1]);
            newRow.dataset.skill3Kind = skillKinds(digimon.skills[2]);

            newRow.innerHTML = `
              <td>
                <div class="digimon-icon-container">
                  <img loading="lazy" src="${characterImagePath}" alt="${name}" class="digimon-icon" onerror="this.src='https://media.dsrwiki.com/dsrwiki/digimon/default.webp';">
                </div>
                <a href="/detail?name=${encodeURIComponent(name)}" class="digimon-link">${digimonName(name)}</a>
              </td>
              <td class="digimon-table-cell">${stats.level}</td>
              <td class="digimon-table-cell">${term(evolution)}</td>
              <td class="digimon-table-cell">
                ${typeImgHtml}
              </td>
              <td class="digimon-table-cell digimon-cell-border-left">${stats.hp}</td>
              <td class="digimon-table-cell">${stats.sp}</td>
              <td class="digimon-table-cell">${stats.STR}</td>
              <td class="digimon-table-cell">${stats.INT}</td>
              <td class="digimon-table-cell">${stats.DEF}</td>
              <td class="digimon-table-cell">${stats.RES}</td>
              <td class="digimon-table-cell">${stats.SPD}</td>
              <td class="digimon-cell-border-left">${strongHtml}</td>
              <td class="digimon-cell-border-right">${weakHtml}</td>
              ${createSkillHtml(digimon.skills[0], 1, name)}
              ${createSkillHtml(digimon.skills[1], 2, name)}
              ${createSkillHtml(digimon.skills[2], 3, name)}
              <td class="digimon-cell-border-left">${fieldsHtml}</td>
            `;
            newRow.style.display = "";
            tableBody.appendChild(newRow);
          } catch (error) {
            console.error('Error processing digimon:', error, name, digimon);
          }
        });

        originalRows = Array.from(tableBody.rows);
        rowModels = originalRows.map(toRowModel);
        if (rebirthStats) applyRebirth();

        // 로딩 완료 후 로딩 표시 숨김
        this.hideLoading();

        // 관리자 도구가 수정 버튼을 붙일 수 있도록 알림
        window.DSRDigimon.data = digimonData;
        document.dispatchEvent(new CustomEvent('digimon:rendered', { detail: { data: digimonData } }));
      } catch (error) {
        console.error('Error in fetchData:', error);
        // 에러 발생 시에도 로딩 표시 숨김
        this.hideLoading();
      }
    }
  };

  // ====================================================
  // 4. FilterModule Module (필터 토글 및 테이블 필터링)
  // ====================================================
  const FilterModule = {

    // 조건 하나 켜기/끄기. key = filters 의 항목 이름, value = 데이터에 있는 값 그대로 (진화 단계·속성·효과 이름 등)
    toggle(key, value) {
      const list = filters[key];
      const index = list.indexOf(value);
      if (index > -1) list.splice(index, 1);
      else list.push(value);
      this.filterTable();
    },

    filterTable() {
      // 데이터가 로딩되지 않았으면 필터링하지 않음
      if (rowModels.length === 0) return;

      const hasFilter = Object.values(filters).some((filter) => filter.length > 0);

      if (!hasFilter) {
        rowModels.forEach(({ row, skills }) => {
          skills.forEach((skill) => {
            updateSkillEffectIcons(skill, skill.attr);
            if (skill.img) setSkillIcon(skill.img, skill.attr, false);
          });
          row.style.display = "";
        });
        return;
      }

      // 스킬 칸 아이콘을 조건에 맞게 바꾸고, 그 칸이 속성 조건에 맞는지 돌려줌
      const updateSkillUI = (skill, activeFilter) => {
        const { attr: defaultAttr, change: changeAttrs, img } = skill;
        if (!defaultAttr || !img) return activeFilter.length === 0;

        if (activeFilter.length === 0) {
          // 효과 조건만 있으면, 그 효과가 나오는 속성으로 바꿔 보여 줌
          const displayedAttr = getAttributeForEffectFilter(skill.effect, defaultAttr, changeAttrs, filters.effect) || defaultAttr;
          setSkillIcon(img, displayedAttr, displayedAttr !== defaultAttr);
          updateSkillEffectIcons(skill, displayedAttr);
          return true;
        }

        if (activeFilter.includes(defaultAttr)) {
          setSkillIcon(img, defaultAttr, false);
          updateSkillEffectIcons(skill, defaultAttr);
          return true;
        }

        const matchedConvertible = activeFilter.find((f) => changeAttrs.includes(f));
        if (matchedConvertible) {
          setSkillIcon(img, matchedConvertible, true);
          updateSkillEffectIcons(skill, matchedConvertible);
          return true;
        }

        setSkillIcon(img, defaultAttr, false);
        updateSkillEffectIcons(skill, defaultAttr);
        return false;
      };

      const anyAttrs = filters.skillAny;
      const slotFilters = [filters.skill1, filters.skill2, filters.skill3];
      const noAttrFilter = slotFilters.every((f) => !f.length) && !anyAttrs.length;

      rowModels.forEach((m) => {
        const evolutionMatches = filters.evolution.length === 0 || filters.evolution.includes(m.evolution);
        const typeMatches = filters.type.length === 0 || filters.type.includes(m.type);
        const fieldMatches =
          filters.field.length === 0 ||
          (fieldMatchAll
            ? filters.field.every((field) => m.fields.includes(field))
            : m.fields.some((field) => filters.field.includes(field)));
        const strengthsMatch = filters.strong.length === 0 || filters.strong.includes(m.strong);
        const weaknessesMatch = filters.weak.length === 0 || filters.weak.includes(m.weak);

        // 슬롯별 필터가 없으면 "아무 위치" 필터(skillAny)로 아이콘 표시(변환 속성 빛남)를 맞춤
        const match = m.skills.map((skill, i) => updateSkillUI(skill, slotFilters[i].length ? slotFilters[i] : anyAttrs));
        // 그 슬롯에서 기본 속성이나 변환 가능한 속성 중 하나가 anyAttrs 에 있으면 true
        const any = m.skills.map(({ attr, change }) => !!attr && anyAttrs.some((a) => a === attr || change.includes(a)));
        const skillsMatch =
          slotFilters.every((f, i) => f.length === 0 || match[i]) &&
          (anyAttrs.length === 0 || any.some(Boolean));
        // 그 슬롯이 속성 조건에 맞는지 (슬롯 필터 > 아무 위치 필터)
        const attrOk = (i) => (slotFilters[i].length ? match[i] : any[i]);

        // 효과: 효과 계산에 쓸 속성 범위 = 슬롯 필터 > (그 슬롯이 맞으면) 아무 위치 필터 > 제한 없음
        let effectMatches = true;
        if (filters.effect.length) {
          const skillEffects = m.skills.map((skill, i) => getPossibleSkillEffects(
            skill.effect,
            skill.attr,
            skill.change,
            slotFilters[i].length ? slotFilters[i] : any[i] ? anyAttrs : []
          ));
          const hasEffect = (effect) => skillEffects.some((set) => set.has(effect));
          effectMatches = effectMatchAll ? filters.effect.every(hasEffect) : filters.effect.some(hasEffect);
        }

        // 스킬 종류 — 고른 종류가 여러 개일 때 skillKindMode 에 따라
        //   all : 1·2·3스킬 어디에든 고른 종류가 다 있으면 (전체 공격 스킬 따로, 캐스팅 스킬 따로여도 됨)
        //   same: 한 스킬이 고른 종류를 모두 가져야 함 (전체 공격이면서 캐스팅인 스킬)
        //   any : 하나라도 있으면
        // 속성 조건이 있으면 그 속성에 맞는 스킬 중에서 찾음 (예: 1스킬 불 + 전체 공격 = 1스킬이 불 속성 전체 공격)
        let kindMatches = true;
        if (filters.skillKind.length) {
          const lists = m.skills.filter((_, i) => noAttrFilter || attrOk(i)).map((skill) => skill.kinds);
          const inSomeSkill = (k) => lists.some((list) => list.includes(k));
          if (skillKindMode === 'same') kindMatches = lists.some((list) => filters.skillKind.every((k) => list.includes(k)));
          else if (skillKindMode === 'any') kindMatches = filters.skillKind.some(inSomeSkill);
          else kindMatches = filters.skillKind.every(inSomeSkill);
        }

        const visible = evolutionMatches && typeMatches && skillsMatch && fieldMatches &&
          strengthsMatch && weaknessesMatch && effectMatches && kindMatches;
        m.row.style.display = visible ? "" : "none";
      });
    },
    resetFilters() {
      Object.keys(filters).forEach((key) => { filters[key] = []; });
      skillKindMode = 'all';
      fieldMatchAll = false;
      effectMatchAll = false;
      // 조건을 다 지운 뒤 표를 한 번만 다시 그림 (예전엔 전체 해제 한 번에 3번 돌았음)
      this.filterTable();
    }
  };

  // ====================================================
  // 5. Sorting Module
  // ====================================================
  function sortTable(column) {
    if (currentSortState.column === column) {
      if (currentSortState.direction === 'none') {
        currentSortState.direction = 'asc';
      } else if (currentSortState.direction === 'asc') {
        currentSortState.direction = 'desc';
      } else {
        currentSortState.direction = 'none';
      }
    } else {
      currentSortState.column = column;
      currentSortState.direction = 'asc';
    }

    applySort();
    updateSortIndicator(column);
  }

  // 지금 정렬 상태(currentSortState)대로 표 줄 순서를 맞춤
  function applySort() {
    const table = document.getElementById("characterTable");
    if (!table) return;
    const rows = Array.from(table.rows);
    const typeOrder = ["백신", "데이터", "바이러스", "프리", "언노운", "노데이터"];
    const column = currentSortState.column;
    if (currentSortState.direction !== 'none') {
      const dir = currentSortState.direction === 'asc' ? 1 : -1;
      // 비교할 값을 줄마다 한 번만 읽어 둠 (비교할 때마다 innerText 를 읽으면 화면 배치 계산이 일어나 느림)
      const keyOf = (row) => {
        const cell = row.cells[column];
        if (column === 0) return (cell.querySelector("a") || cell).textContent.trim();
        if (column === 3) {
          const i = typeOrder.indexOf(cell.querySelector("img")?.alt.trim());
          return i === -1 ? typeOrder.length : i;
        }
        // 전생 값이 없는 칸('—')은 오름차순·내림차순 모두 맨 뒤로
        if (cell.textContent === NO_VALUE) return null;
        // 숫자가 아니면 양쪽 모두 0 으로 봄 (예전엔 한쪽만 0 이라 순서가 뒤섞였음)
        const n = parseFloat(cell.textContent);
        return isNaN(n) ? 0 : n;
      };
      const keyed = rows.map((row) => [keyOf(row), row]);
      keyed.sort(([a], [b]) =>
        a === null || b === null ? (a === null) - (b === null) :
        dir * (typeof a === 'string' ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0)
      );
      table.replaceChildren(...keyed.map(([, row]) => row));
    } else {
      table.replaceChildren(...originalRows);
    }
  }

  function updateSortIndicator(column) {
    const sortSpans = document.querySelectorAll('[id^="sort-"]');
    sortSpans.forEach(span => {
      span.className = '';
    });

    if (currentSortState.column === column && currentSortState.direction !== 'none') {
      const sortSpan = document.getElementById(`sort-${getColumnId(column)}`);
      if (sortSpan) {
        sortSpan.className = currentSortState.direction === 'asc' ? 'ascending' : 'descending';
      }
    }
  }

  function getColumnId(column) {
    const columnIds = [
      'name', 'level', 'evolution', 'type', 'hp', 'sp',
      'STR', 'INT', 'DEF', 'RES', 'SPD'
    ];
    return columnIds[column] || '';
  }

  // ====================================================
  // 6. Search Module
  // ====================================================
  // 새 필터의 검색창이 부름 (window.DSRDigimon.searchByName)
  function searchByName(value) {
    const terms = value.toLowerCase().split(",").map((term) => term.trim());
    // 데이터가 로딩되지 않았으면 검색하지 않음
    if (rowModels.length === 0) return;

    // 검색어를 지우면 고른 조건대로 다시 보여 줌 (조건이 없으면 전체).
    // 예전엔 조건이 없을 때 검색어를 지우면 표가 통째로 비었음.
    if (terms.length === 1 && terms[0] === "") {
      FilterModule.filterTable();
      return;
    }

    rowModels.forEach(({ row, name }) => {
      row.style.display = terms.some((term) => name.includes(term)) ? "" : "none";
    });
  }

  // ====================================================
  // 8. 초기화 및 전역 함수 노출
  // ====================================================
  // 이미지가 다 불러와질 때까지(window.onload) 기다리지 않고, HTML을 읽자마자 바로 데이터를 요청합니다.
  // (이 스크립트는 defer 라서 실행 시점에 표 HTML이 이미 준비되어 있음. 필터 화면은 digimon-filter.js 가 그림)
  const init = () => {
    // 페이지 로드 시 로딩 표시를 보이도록 설정
    const loadingSpinner = document.getElementById('loading-spinner');
    const resultTable = document.querySelector('.result-table');
    if (loadingSpinner) loadingSpinner.classList.remove('hidden');
    if (resultTable) resultTable.style.display = 'none';

    TableDataManager.fetchData();
    initTableTooltips();
    if (import.meta.env.DEV) initRebirthToggle();
    initAdminLoader(signal, 'digimon-admin', 'DSRDigimonAdmin');
  };

  // 개발 서버 전용: 전생 값을 불러오고 필터 줄(검색창 줄)의 [상세 필터] 앞에 토글을 붙임
  // (필터 화면은 이 init 바로 뒤에 같은 흐름에서 그려지므로, fetch 가 끝날 땐 .fv-bar 가 있음)
  function initRebirthToggle() {
    fetch('/__local/calculator.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((extra) => {
        const rebirth = extra?.rebirth;
        const bar = document.querySelector('.fv-bar');
        if (signal.aborted || !bar || !rebirth || !Object.keys(rebirth).length) return;
        rebirthStats = rebirth;
        try { rebirthOn = localStorage.getItem(REBIRTH_KEY) === '1'; } catch (e) { /* 저장소 차단 */ }
        const level = Object.values(rebirth)[0]?.stats?.level;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fv-rebirth';
        btn.title = `로컬 전용: 최대 레벨 100 인 성숙기·완전체를 전생 1회 Lv${level} 스탯으로 표시 (나머지는 ${NO_VALUE})`;
        const sw = document.createElement('span');
        sw.className = 'fv-switch';
        sw.setAttribute('aria-hidden', 'true');
        btn.append(sw, document.createTextNode(`전생 Lv${level}`));
        const sync = () => btn.setAttribute('aria-pressed', String(rebirthOn));
        btn.addEventListener('click', () => {
          rebirthOn = !rebirthOn;
          try { localStorage.setItem(REBIRTH_KEY, rebirthOn ? '1' : '0'); } catch (e) { /* 저장소 차단 */ }
          sync();
          applyRebirth();
        });
        sync();
        bar.insertBefore(btn, bar.querySelector('.fv-more'));
        applyRebirth();
      });
  }

  // 필터 화면(digimon-filter.js)과 관리자 도구(digimon-admin.js)가 쓰는 공개 API
  window.DSRDigimon = {
    data: null,
    reload: () => TableDataManager.fetchData(true),
    // 새 필터 화면이 같은 판단 코드를 쓰도록 공개
    filters,
    filterTable: () => FilterModule.filterTable(),
    // toggle('evolution', '궁극체'), toggle('skillAny', '불'), toggle('effect', '공격력 증가') …
    toggle: (key, value) => FilterModule.toggle(key, value),
    reset: () => FilterModule.resetFilters(),
    searchByName,
    showTooltip: showCustomTooltip,
    hideTooltip: hideCustomTooltip,
    setSkillKindMode(mode) { skillKindMode = mode; FilterModule.filterTable(); },
    getSkillKindMode: () => skillKindMode,
    setFieldMatchAll(value) { fieldMatchAll = !!value; FilterModule.filterTable(); },
    getFieldMatchAll: () => fieldMatchAll,
    setEffectMatchAll(value) { effectMatchAll = !!value; FilterModule.filterTable(); },
    getEffectMatchAll: () => effectMatchAll,
  };


  // 표 머리글을 누르면 정렬 (<th data-sort="열 번호">)
  document.querySelector('.result-table thead')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) sortTable(Number(th.dataset.sort));
  }, { signal });

  // 모든 함수를 연결한 뒤 시작
  if (document.readyState === 'loading') onReady(init);
  else init();
})();
}
