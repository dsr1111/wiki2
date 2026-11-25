// 한국어 / 영어 전환
// - 고른 언어는 localStorage 'dsrLang' 에 기억 ('en' 이 아니면 한국어). 바꾸면 페이지를 다시 불러옴
// - 게임 용어(속성·진화 단계·효과 등)는 TERMS, 디지몬·스킬 이름은 이름 사전(NAMES_URL)에서 찾음
// - 위키 자체 문구는 t('한국어', 'English') 처럼 두 말을 같이 적어 둠
// - 사전에 없는 말은 한국어 그대로 보여 줌

const LANG_KEY = 'dsrLang';
const NAMES_URL = import.meta.env.DEV ? '/__local/i18n-en.json' : 'https://media.dsrwiki.com/data/csv/i18n-en.json';

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
}
export const isEn = () => getLang() === 'en';

export function setLang(lang) {
  try {
    if (lang === 'en') localStorage.setItem(LANG_KEY, 'en');
    else localStorage.removeItem(LANG_KEY);
  } catch { /* 저장소 차단 */ }
  location.reload();
}

/** 위키 문구: 지금 언어에 맞는 쪽 */
export const t = (ko, en) => (isEn() ? en : ko);

/**
 * 페이지에 적어 둔 글자 바꾸기: data-en="English" 가 있는 요소의 첫 글자 덩어리만 바꿈
 * (안에 정렬 표시 같은 다른 요소가 있어도 그대로 둠). titleEn: 탭 제목
 */
export function applyStatic(root = document, titleEn) {
  if (!isEn()) return;
  root.querySelectorAll('[data-en]').forEach((el) => {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.trim());
    if (node) node.data = node.data.replace(node.data.trim(), el.dataset.en);
    else el.textContent = el.dataset.en;
  });
  if (titleEn) document.title = `${titleEn} | DSR WIKI`;
  document.documentElement.lang = 'en';
}

// 게임 용어 (게임 영어판 표기)
const TERMS = {
  // 진화 단계
  유년기1: 'Baby 1', 유년기2: 'Baby 2', 성장기: 'Rookie', 성숙기: 'Champion', 완전체: 'Ultimate', 궁극체: 'Mega',
  // 진화
  암흑진화: 'Dark EVO', 특수진화: 'Special EVO', 버스트진화: 'Burst EVO', 조그레스: 'Jogress', 유대감: 'Bond',
  // 능력치
  레벨: 'Level', 힘: 'STR', 지능: 'INT', 수비: 'DEF', 저항: 'RES', 속도: 'SPD',
  // 타입
  백신: 'Vaccine', 데이터: 'Data', 바이러스: 'Virus', 프리: 'Free', 언노운: 'Unknown',
  // 속성
  물리: 'Physical', 불: 'Fire', 물: 'Water', 바람: 'Wind', 얼음: 'Ice', 천둥: 'Thunder',
  흙: 'Earth', 나무: 'Wood', 강철: 'Steel', 빛: 'Light', 어둠: 'Darkness',
  // 강점·약점
  회피: 'Evasion', 반사: 'Reflection', 내성: 'Resistance', 약점: 'Weakness',
  회피불가: 'Unavoidable', 화피불가: 'Unavoidable', 효과확률: 'Effect Chance',
  // 확률 표시
  확정: 'Guaranteed',
  // 스킬
  근거리: 'Melee', 원거리: 'Ranged', 자신: 'Self', 단일: 'Single', 전체: 'All', 아군: 'Allies', 보조: 'Support',
  // 효과
  출혈: 'Bleed', 열상: 'Laceration', 저주: 'Curse', 질식: 'Suffocation', 성흔: 'Stigmata', 파열: 'Rupture',
  한기: 'Chill', 부식: 'Corrosion', 화상: 'Burn', 중독: 'Poison', 감전: 'Shock',
  봉인: 'Seal', 빙결: 'Freeze', 석화: 'Petrify', 격리: 'Isolation', 스턴: 'Stun', 중압: 'Pressure',
  마비: 'Paralysis', 침잠: 'Submergence', 진공: 'Vacuum', 공황: 'Panic',
  연소: 'Combustion', 매료: 'Charm', 혼란: 'Confusion', 금속화: 'Metallization', 꼭두각시: 'Marionette', 감염: 'Infected',
  '잔류 에너지': 'Residual Energy', '영원한 잠': 'Eternal Sleep', '스나이퍼 미사일': 'Sniper Missile',
  '빛의 잔영': 'Afterimage of Light', '안개 장벽': 'Fog Barrier', 만개: 'Full Bloom', 회복: 'Recovery',
  '방어력 감소': 'Defense Power Decrease', '방어력 증가': 'Defense Increase', '공격력 증가': 'Attack Power Increase',
  '속도 감소': 'Speed Decrease', '속도 증가': 'Speed Increase', '치명타율 증가': 'Critical Hit Rate Increase',
  '회피율 증가': 'Evade Rate Increase', '스택 증가': 'Stack Gain', '스택 소모': 'Stack Use', 스택: 'Stack',
  // 지역·맵 (이름 사전에 없는 것)
  파일섬: 'File Island', '개굴몬 성 1F': "Gekomon's Castle 1F", '개굴몬 성 2F': "Gekomon's Castle 2F",
  // 스택 이름
  음양: 'Yin-Yang', '나태의 업화': 'Hellfire of Sloth', 용혼: 'Dragon Soul',
};

// 이름 사전: 위키 데이터에 나오는 게임 문구 { 한국어: 영어 }. 퀘스트 대사는 따로 (퀘스트 페이지만)
const QUEST_URL = NAMES_URL.replace('i18n-en.json', 'i18n-quest-en.json');
let names = null;
const loading = {};
const fetchJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
/** 영어일 때 사전을 받아 둠 (한국어면 아무것도 안 함). 페이지를 그리기 전에 await. quest: 퀘스트 대사까지 */
export async function loadNames({ quest = false } = {}) {
  if (!isEn()) return;
  loading.main ??= fetchJson(NAMES_URL).then((d) => { names = { ...d, ...names }; });
  if (quest) loading.quest ??= fetchJson(QUEST_URL).then((d) => { names = { ...names, ...d }; });
  await Promise.all(Object.values(loading));
}

const lookup = (k) => names?.[k] ?? TERMS[k];
const TAIL = /^(.+?)(\s*(?:[x×*]\s*\d+.*|\([^()]*\)|\+\s*[\d.]+%?|Lv\.?\s*\d+|\d+))$/;
const HEAD = /^(\[[^\]]+\]\s*)(.+)$/;
const SEPS = ['<br>', '\n', ' / ', ', ', ',', ' + ', ';'];
// 괄호·꼬리 안의 짧은 말
const TAIL_WORDS = { 거래가능: 'Tradable', 거래불가: 'Untradable', 일: 'd', 시간: 'h', 분: 'm', 랜덤: 'Random', 이벤트: 'Event' };
const trTail = (tail) => tail.replace(/[가-힣]+/g, (w) => lookup(w) ?? TAIL_WORDS[w] ?? w);

/**
 * 게임 문구 → 영어. 사전에 그대로 있으면 그것, 없으면 목록(쉼표·줄바꿈)·수량(x3)·괄호를 떼어 조각마다 찾음.
 * 못 찾은 조각은 한국어 그대로. 한국어 모드면 아무것도 안 바꿈
 */
export function tr(s) {
  if (!isEn() || s == null || s === '') return s;
  return trIn(String(s), 0);
}
function trIn(s, depth) {
  const k = s.trim();
  if (!k || !/[가-힣]/.test(k)) return s;
  const hit = lookup(k);
  if (hit != null) return s.replace(k, hit);
  if (depth > 4) return s;
  for (const sep of SEPS) if (k.includes(sep)) return k.split(sep).map((p) => trIn(p, depth + 1)).join(sep);
  let m = k.match(TAIL);
  // 수량 "x 4" 는 영어 이름 뒤에 붙으면 읽기 어려워서 " x4" 로
  if (m) { const a = trIn(m[1], depth + 1); if (a !== m[1]) return a + trTail(m[2]).replace(/^\s*[x×]\s*/, ' x'); }
  m = k.match(HEAD);
  if (m) { const b = trIn(m[2], depth + 1); if (b !== m[2]) return trTail(m[1]) + b; }
  return s;
}

/** 게임 용어 → 영어 (한국어 모드거나 모르는 말이면 그대로) */
export const term = (ko) => (isEn() && ko != null ? TERMS[String(ko).trim()] ?? tr(ko) : ko);
/** 디지몬 이름 → 영어 */
export const digimonName = tr;
/** 스킬 이름 → 영어 */
export const skillName = tr;
/** 영어 이름 (검색용, 모드와 상관없이. 사전을 안 받았으면 '') */
export const digimonNameEn = (ko) => names?.[ko] ?? '';
