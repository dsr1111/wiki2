// 기존 app/deck.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
export function init(signal, onReady) {
// ===== 기존 app/deck.js =====

// 1) 외부 JSON으로부터 로드할 변수
let deckData = {};

// DOMContentLoaded 에서 JSON 로드 후 초기화
onReady(() => {
  fetch('https://media.dsrwiki.com/data/csv/deck.json')
    .then(res => {
      if (!res.ok) throw new Error('deck.json 로드 실패');
      return res.json();
    })
    .then(json => {
      deckData = json;
      renderAllDecks();
      setupEventListeners();
    })
    .catch(err => {
      console.error(err);
      document.getElementById('deck-container').textContent = '덱 데이터를 불러올 수 없습니다.';
    });
});

// 덱 카드는 처음에 한 번만 만들고, 검색할 때는 맞는 카드만 보이게 함.
// (예전엔 글자를 칠 때마다 카드와 이미지 수백 개를 지우고 새로 만들었음)
let cards = []; // { info, el, terms }
let noResults = null;

// 모든 덱 렌더링 함수
function renderAllDecks() {
  const deckContainer = document.getElementById('deck-container');
  deckContainer.innerHTML = '';
  cards = Object.entries(deckData).map(([deckName, deckInfo]) => {
    const el = createDeckCard(deckName, deckInfo);
    deckContainer.appendChild(el);
    return { info: deckInfo, el, terms: '' };
  });
  noResults = document.createElement('div');
  noResults.className = 'no-results';
  noResults.textContent = '검색 결과가 없습니다.';
}

// 조건에 맞는 덱만 보이고, 검색어를 강조 (matches 가 없으면 전부 보임)
function showDecks(matches, highlightTerms = []) {
  let shown = 0;
  cards.forEach((card) => {
    const visible = !matches || matches(card.info);
    card.el.style.display = visible ? '' : 'none';
    if (!visible) return;
    shown++;
    const key = highlightTerms.join(',');
    if (card.terms !== key) {
      card.terms = key;
      applyHighlights(card.el, card.info, highlightTerms);
    }
  });
  const container = document.getElementById('deck-container');
  if (shown === 0) container.appendChild(noResults);
  else noResults.remove();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 덱 카드 생성 함수
function createDeckCard(deckName, deckInfo, highlightTerms = []) {
  const deckCard = document.createElement('div');
  deckCard.className = 'deck-card';

  // 제목
  const title = document.createElement('h2');
  title.className = 'deck-title';
  title.textContent = deckName;
  deckCard.appendChild(title);

  // 디지몬 이미지
  const digimonImages = document.createElement('div');
  digimonImages.className = 'digimon-images-container';
  deckInfo.digimon.forEach(d => {
    const avatar = document.createElement('div');
    avatar.className = 'digimon-avatar-box';
    avatar.dataset.name = d.name.toLowerCase();
    const img = document.createElement('img');
    img.loading = 'lazy'; // 화면에 가까워질 때 받음 (목록이 길어서 처음에 전부 받지 않게)
    img.decoding = 'async';
    img.className = 'digimon-avatar-img';
    const safeName = d.name.replace(/:/g, '_');
    img.src = `https://media.dsrwiki.com/dsrwiki/digimon/${safeName}/${safeName}.webp`;
    img.alt = d.name;
    img.onerror = () => { avatar.textContent = d.name.charAt(0); };
    avatar.appendChild(img);

    // 툴팁
    const tip = `Lv.${d.level} ${d.name} `;
    avatar.addEventListener('mouseover', () => {
      document.querySelectorAll('.digimon-tooltip-box').forEach(t => t.remove());
      const tt = document.createElement('div');
      tt.className = 'digimon-tooltip-box';
      tt.textContent = tip;
      document.body.appendChild(tt);
      const r = avatar.getBoundingClientRect();
      tt.style.left = r.left + r.width / 2 + 'px';
      tt.style.top = r.bottom + 10 + 'px';
    });

    avatar.addEventListener('mouseout', () => {
      document.querySelectorAll('.digimon-tooltip-box').forEach(t => t.remove());
    });

    digimonImages.appendChild(avatar);
  });
  deckCard.appendChild(digimonImages);

  // 설명
  const desc = document.createElement('div');
  desc.className = 'deck-description';
  deckCard.appendChild(desc);

  const effectsContainer = document.createElement('div');
  effectsContainer.className = 'effects-container';
  deckCard.appendChild(effectsContainer);

  applyHighlights(deckCard, deckInfo, highlightTerms);
  return deckCard;
}

// 검색어 강조: 디지몬 테두리, 설명, 효과 글자
function highlightText(html, highlightTerms) {
  highlightTerms.forEach(term => {
    const re = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    html = html.replace(re, '<span class="highlight">$1</span>');
  });
  return html;
}

function applyHighlights(deckCard, deckInfo, highlightTerms) {
  deckCard.querySelectorAll('.digimon-avatar-box').forEach(avatar => {
    avatar.classList.toggle('digimon-avatar-highlight',
      highlightTerms.some(term => avatar.dataset.name.includes(term)));
  });
  deckCard.querySelector('.deck-description').innerHTML = highlightText(deckInfo.description, highlightTerms);
  deckCard.querySelector('.effects-container').innerHTML = deckInfo.effects
    // 숫자 강조 + 다중 키워드 하이라이트
    .map(e => highlightText(e.replace(/(\+\s*[\d\.]+%?)/g, '<span class="effect-value">$1</span>'), highlightTerms))
    .join(' / ');
}

function setupEventListeners() {
  const digimonSearch = document.getElementById('digimon-search');
  const effectSearch = document.getElementById('effect-search');

  digimonSearch.addEventListener('input', () => {
    const terms = parseTerms(digimonSearch.value);
    if (terms.length === 0) return showDecks(null);

    // 디지몬 목록 중 하나라도 키워드를 포함하면 매칭
    effectSearch.value = '';
    showDecks(info => info.digimon.some(d =>
      terms.some(term => d.name.toLowerCase().includes(term))
    ), terms);
  });

  effectSearch.addEventListener('input', () => {
    const terms = parseTerms(effectSearch.value);
    if (terms.length === 0) return showDecks(null);

    // 효과 목록 중 하나라도 키워드를 포함하면 매칭
    digimonSearch.value = '';
    showDecks(info => info.effects.some(e =>
      terms.some(term => e.toLowerCase().includes(term))
    ), terms);
  });
}

function parseTerms(input) {
  return input
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
}
}
