// 기존 app/gacha.js, app/gacha-presentation-assets.js, app/gacha-presentation.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
// 가챠 연출용 아이템 등급·아이콘 (게임 파일에서 뽑은 고정 데이터. 보상 이름·개수로 찾음, 줄 순서와 무관)
import presentationAssets from '../data/gacha-presentation-assets.json';
import { t, tr, isEn, loadNames } from './i18n.js';
const isEnLang = isEn();
export function init(signal, onReady) {
// ===== 기존 app/gacha.js =====

// 가챠 데이터
let gachaData = null;
let currentBox = null;
let gachaItems = [];

// 로그 통계 데이터
let logStats = {
    totalOpens: 0,
    items: {}, // { "아이템명": { count: 횟수, grade: 등급, probability: 확률 } }
    grades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    tradeable: { available: 0, unavailable: 0 },
    rareItems: 0 // 서버 공지 대상으로 설정된 아이템 획득 수량
};

// 통계 초기화 함수
function resetStats() {
    logStats = {
        totalOpens: 0,
        items: {},
        grades: { 1: 0, 2: 0, 3: 0, 4: 0 },
        tradeable: { available: 0, unavailable: 0 },
        rareItems: 0
    };
}

// 타임스탬프 생성 함수
function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// 등급별 색상 클래스 반환 함수
function getGradeColorClass(grade) {
    if (!grade) return 'item-name'; // 등급이 없으면 기본 색상
    return `item-grade-${grade}`;
}

// 아이템 이름에서 거래 가능/불가 정보 추출
function extractTradeInfo(itemName) {
    if (itemName.includes('거래가능')) {
        return { displayName: itemName.replace(/\s*\(거래가능\)/g, ''), tradeStatus: 'available' };
    } else if (itemName.includes('거래 불가') || itemName.includes('거래불가')) {
        return { displayName: itemName.replace(/\s*\(거래\s*불가\)/g, ''), tradeStatus: 'unavailable' };
    }
    return { displayName: itemName, tradeStatus: null };
}

// 콘솔에 메시지 추가
function addConsoleLine(message, isSystem = false, isRare = false, logNumber = null, outputTarget = null) {
    const consoleContent = outputTarget || document.getElementById('console-content');
    const line = document.createElement('div');
    line.className = 'console-line';

    // 서버 공지 대상 보상인 경우 하이라이트 클래스 추가
    if (isRare) {
        line.classList.add('rare-item');
    }

    if (isSystem) {
        line.innerHTML = `<span class="timestamp">${t('[시스템]', '[System]')}</span><span>${message}</span>`;
    } else {
        // 개봉 순서 번호 추가 (고정 폭으로 포맷팅)
        let numberHtml = '';
        if (logNumber !== null) {
            // 최대 9999개까지 고려하여 4자리로 포맷팅
            const formattedNumber = String(logNumber).padStart(4, ' ');
            numberHtml = `<span class="log-number">#${formattedNumber}</span>`;
        }
        line.innerHTML = numberHtml + message;
    }

    consoleContent.appendChild(line);

    if (!outputTarget) {
        scrollConsoleToBottom();
    }
}

function scrollConsoleToBottom() {
    // 스크롤을 맨 아래로 (DOM 업데이트 후 실행)
    setTimeout(() => {
        const consoleWrapper = document.querySelector('.console-content-wrapper');
        if (consoleWrapper) {
            consoleWrapper.scrollTop = consoleWrapper.scrollHeight;
        }
    }, 0);
}

// 총 열기 횟수 카운터
let totalOpenCount = 0;

// 카운터 업데이트 함수
function updateCounter() {
    document.getElementById('total-count').textContent = totalOpenCount.toLocaleString();
}

// 상자 선택 함수
function selectBox(boxId) {
    if (!gachaData) return;

    const box = gachaData.boxes.find(b => b.id === boxId);
    if (!box) return;

    // 이전 상자와 다른 상자로 변경되는 경우에만 로그 및 카운터 초기화
    if (currentBox && currentBox.id !== boxId) {
        const consoleContent = document.getElementById('console-content');
        consoleContent.innerHTML = '';
        totalOpenCount = 0;
        updateCounter();
        resetStats();
    }

    currentBox = box;
    gachaItems = box.items;

    // UI 업데이트
    document.getElementById('box-name').textContent = tr(box.name);
    document.getElementById('box-description').textContent = '';
    const boxOpenContainer = document.getElementById('box-open-container');
    boxOpenContainer.style.opacity = '1';
    boxOpenContainer.style.pointerEvents = 'auto';

    // 상자 이미지 설정
    const encodedBoxName = encodeURIComponent(box.name + '.webp');
    const imageUrl = `https://media.dsrwiki.com/dsrwiki/item/${encodedBoxName}`;
    const boxImage = document.getElementById('box-image');
    const boxImagePlaceholder = document.getElementById('box-image-placeholder');

    // 플레이스홀더 먼저 숨김 (배경만 보이도록)
    boxImage.style.display = 'none';
    boxImagePlaceholder.style.display = 'none';

    // 이미지 로드 시도
    const img = new Image();
    img.onload = function () {
        boxImage.src = imageUrl;
        boxImage.style.display = 'block';
        boxImagePlaceholder.style.display = 'none';
    };
    img.onerror = function () {
        boxImage.style.display = 'none';
        boxImagePlaceholder.style.display = 'none'; // 배경만 보이도록
    };
    img.src = imageUrl;
}

// 가챠 실행 함수 (단일)
function executeSingleGacha(outputTarget = null) {
    if (!currentBox || gachaItems.length === 0) {
        addConsoleLine(t('먼저 상자를 선택해주세요.', 'Select a box first.'), true, false, null, outputTarget);
        return null;
    }

    // 랜덤 값 생성 (0 ~ 100)
    const random = Math.random() * 100;

    // 누적 확률로 아이템 선택
    let cumulativeProbability = 0;
    let selectedItem = null;

    for (const item of gachaItems) {
        cumulativeProbability += item.probability;
        if (random <= cumulativeProbability) {
            selectedItem = item;
            break;
        }
    }

    // 선택된 아이템이 없으면 마지막 아이템 선택 (오차 보정)
    if (!selectedItem) {
        selectedItem = gachaItems[gachaItems.length - 1];
    }

    // 콘솔에 결과 표시 (상자 이름 포함, 등급별 색상 적용)
    const gradeClass = getGradeColorClass(selectedItem.grade);
    const tradeInfo = extractTradeInfo(selectedItem.name);

    // 게임 Item_Box.Draw_Server_MSG를 옮긴 값으로만 하이라이트 판단
    // 필드가 없는 이전 데이터는 확률로 추정하지 않고 하이라이트하지 않음
    const isRare = selectedItem.serverNotice === true;

    let tradeStatusHtml = '';
    if (tradeInfo.tradeStatus === 'available') {
        tradeStatusHtml = ` <span class="trade-available">${t('(거래가능)', '(Tradable)')}</span>`;
    } else if (tradeInfo.tradeStatus === 'unavailable') {
        tradeStatusHtml = ` <span class="trade-unavailable">${t('(거래불가)', '(Untradable)')}</span>`;
    }

    // 카운터 증가 (번호는 증가 전 값 사용)
    totalOpenCount++;
    const currentLogNumber = totalOpenCount;
    if (!outputTarget) {
        updateCounter();
    }

    const message = t(
        `<span style="color: #9cdcfe;">[${currentBox.name}]</span> <span class="${gradeClass}">[${tradeInfo.displayName}]</span> <span class="item-count">${selectedItem.count}개</span>를 획득했습니다.${tradeStatusHtml}`,
        `<span style="color: #9cdcfe;">[${tr(currentBox.name)}]</span> Obtained <span class="${gradeClass}">[${tr(tradeInfo.displayName)}]</span> <span class="item-count">x${selectedItem.count}</span>.${tradeStatusHtml}`);
    addConsoleLine(message, false, isRare, currentLogNumber, outputTarget);

    // 통계 업데이트
    updateStats(selectedItem, tradeInfo, isRare);

    return selectedItem;
}

// 통계 업데이트 함수
function updateStats(item, tradeInfo, isRare) {
    logStats.totalOpens++;

    // 아이템별 획득 횟수
    const itemKey = item.name;
    if (!logStats.items[itemKey]) {
        logStats.items[itemKey] = {
            count: 0,
            grade: item.grade || 1,
            probability: item.probability || 0,
            displayName: tradeInfo.displayName
        };
    }
    logStats.items[itemKey].count += item.count;

    // 등급별 획득 횟수
    const grade = item.grade || 1;
    if (logStats.grades[grade] !== undefined) {
        logStats.grades[grade] += item.count;
    }

    // 거래 가능/불가 통계
    if (tradeInfo.tradeStatus === 'available') {
        logStats.tradeable.available += item.count;
    } else if (tradeInfo.tradeStatus === 'unavailable') {
        logStats.tradeable.unavailable += item.count;
    }

    // 서버 공지 대상 아이템 통계 (하이라이트와 동일한 기준)
    if (isRare) {
        logStats.rareItems += item.count;
    }
}

// 통계 모달 내용 업데이트
function updateStatsModal() {
    const modalBody = document.getElementById('stats-modal-body');

    if (logStats.totalOpens === 0) {
        modalBody.innerHTML = `<div style="text-align: center; color: #9cdcfe; padding: 40px;">${t('아직 개봉한 상자가 없습니다.', 'No boxes opened yet.')}</div>`;
        return;
    }

    let html = '';

    // 아이템별 상세 통계
    html += '<div class="stats-section">';
    html += `<div class="stats-section-title">${t('아이템별 획득 통계', 'Items Obtained')}</div>`;
    html += '<div class="stats-item-list">';

    // 획득 횟수 순으로 정렬
    const sortedItems = Object.entries(logStats.items)
        .sort((a, b) => b[1].count - a[1].count);

    sortedItems.forEach(([itemName, itemData]) => {
        const percentage = logStats.totalOpens > 0 ? ((itemData.count / logStats.totalOpens) * 100).toFixed(2) : 0;
        const gradeClass = `item-grade-${itemData.grade}`;
        html += `<div class="stats-item-row">
            <span class="stats-item-name ${gradeClass}">${tr(itemData.displayName)}</span>
            <span class="stats-item-count">${t(`${itemData.count.toLocaleString()}개`, `x${itemData.count.toLocaleString()}`)}</span>
            <span class="stats-item-percentage">${percentage}%</span>
          </div>`;
    });

    html += '</div></div>';

    modalBody.innerHTML = html;
}

// 가챠 일괄 실행 함수
function executeMultipleGacha(count) {
    if (window.GachaPresentation?.busy) return;
    if (!currentBox) {
        addConsoleLine(t('먼저 상자를 선택해주세요.', 'Select a box first.'), true);
        return;
    }

    if (count <= 0 || count > 1000) {
        addConsoleLine(t('개수는 1~1000 사이여야 합니다.', 'Count must be between 1 and 1000.'), true);
        return;
    }

    // 추첨 순서와 통계는 그대로 두고 화면 반영만 일괄 처리한다.
    const fragment = document.createDocumentFragment();
    const previousOpenCount = totalOpenCount;
    const resultBatch = [];
    try {
        for (let i = 0; i < count; i++) {
            const result = executeSingleGacha(fragment);
            if (result) resultBatch.push(result);
        }
    } finally {
        if (fragment.hasChildNodes()) {
            document.getElementById('console-content').appendChild(fragment);
            scrollConsoleToBottom();
        }
        if (totalOpenCount !== previousOpenCount) {
            updateCounter();
        }
    }
    window.GachaPresentation?.present(currentBox, resultBatch);
}

// 이벤트 리스너 설정
onReady(async function () {
    // JSON 데이터 로드
    try {
        const [response] = await Promise.all([fetch('https://media.dsrwiki.com/data/csv/gacha.json'), loadNames()]);
        gachaData = await response.json();

        // 상자 선택 드롭다운 채우기
        const boxSelect = document.getElementById('box-select');
        gachaData.boxes.forEach(box => {
            const option = document.createElement('option');
            option.value = box.id;
            option.textContent = tr(box.name);
            boxSelect.appendChild(option);
        });

        // 첫 번째 상자 자동 선택
        if (gachaData.boxes.length > 0) {
            const firstBoxId = gachaData.boxes[0].id;
            boxSelect.value = firstBoxId;
            selectBox(firstBoxId);
        }

        // 상자 선택 이벤트
        boxSelect.addEventListener('change', function () {
            if (this.value) {
                selectBox(this.value);
            } else {
                currentBox = null;
                gachaItems = [];
                document.getElementById('box-name').textContent = t('상자를 선택하세요', 'Select a box');
                document.getElementById('box-description').textContent = '';
                const boxOpenContainer = document.getElementById('box-open-container');
                boxOpenContainer.style.opacity = '0.5';
                boxOpenContainer.style.pointerEvents = 'none';
            }
        });
    } catch (error) {
        console.error('가챠 데이터 로드 실패:', error);
        addConsoleLine(t('가챠 데이터를 불러오는데 실패했습니다.', 'Failed to load gacha data.'), true);
    }

    // 개봉 수 조절 버튼
    document.getElementById('count-minus-btn').addEventListener('click', function () {
        const countInput = document.getElementById('gacha-count');
        const currentValue = parseInt(countInput.value) || 1;
        if (currentValue > 1) {
            countInput.value = currentValue - 1;
        }
    });

    document.getElementById('count-plus-btn').addEventListener('click', function () {
        const countInput = document.getElementById('gacha-count');
        const currentValue = parseInt(countInput.value) || 1;
        if (currentValue < 1000) {
            countInput.value = currentValue + 1;
        }
    });

    // 개봉 버튼
    document.getElementById('open-btn').addEventListener('click', function () {
        if (!currentBox) {
            addConsoleLine(t('먼저 상자를 선택해주세요.', 'Select a box first.'), true);
            return;
        }
        const count = parseInt(document.getElementById('gacha-count').value) || 1;
        executeMultipleGacha(count);
    });

    // 엔터키로 개봉
    document.getElementById('gacha-count').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('open-btn').click();
        }
    });

    // 로그 지우기 버튼
    document.getElementById('clear-btn').addEventListener('click', function () {
        const consoleContent = document.getElementById('console-content');
        consoleContent.innerHTML = '';
        // 카운터 및 통계 초기화
        totalOpenCount = 0;
        updateCounter();
        resetStats();
    });

    // 통계 보기 버튼
    document.getElementById('stats-btn').addEventListener('click', function () {
        updateStatsModal();
        document.getElementById('stats-modal').style.display = 'flex';
    });

    // 통계 모달 닫기 버튼
    document.getElementById('stats-modal-close').addEventListener('click', function () {
        document.getElementById('stats-modal').style.display = 'none';
    });

    // 모달 배경 클릭 시 닫기
    document.getElementById('stats-modal').addEventListener('click', function (e) {
        if (e.target === this) {
            this.style.display = 'none';
        }
    });

    // 초기 카운터 표시
    updateCounter();
});

// ===== 기존 app/gacha-presentation-assets.js =====
// 상자별 아이템 등급·아이콘 정보는 src/data/gacha-presentation-assets.json 으로 옮김 (맨 위 import)

// ===== 기존 app/gacha-presentation.js =====
(() => {
  "use strict";
  // Upload the contents of assets/gacha under this CDN prefix (keep the trailing slash).
  const assetBase = new URL('https://media.dsrwiki.com/assets/gacha/');
  const dialog = document.createElement("dialog");
  dialog.id = "presentation-dialog";
  dialog.setAttribute("aria-labelledby", "result-title");
  dialog.style.setProperty('--gacha-result-background', 'url("'+new URL('media/result-background.png', assetBase).href+'")');
  dialog.innerHTML = `
    <section class="result-window">
      <div class="presentation-topbar"><button type="button" id="result-close" aria-label="${t('결과 화면 닫기', 'Close results')}">${t('닫기 ×', 'Close ×')}</button></div>
      <div class="result-stage"><div class="hero-rays" aria-hidden="true"></div><button type="button" class="hero-item" id="result-hero"></button></div>
      <h2 class="result-heading" id="result-title"></h2>
      <div class="result-grid-wrap"><div class="result-grid" id="result-grid" aria-label="공지 우선, Box_Grade 높은 순으로 표시한 획득 보상"></div></div>
      <div class="result-detail" id="result-detail" aria-live="polite"><strong></strong></div>
      <div class="result-actions"><button type="button" class="secondary" id="result-again">${t('다시 개봉', 'Open Again')}</button><button type="button" id="result-receive">${t('확인', 'OK')}</button></div>
    </section>
    <section class="result-video" aria-label="게임 원본 개봉 영상">
      <video id="result-movie" playsinline preload="none"></video>
      <div class="video-controls"><button type="button" id="result-skip">${t('건너뛰기', 'Skip')}</button></div>
    </section>`;
  document.body.append(dialog);
  const video = dialog.querySelector("video");
  const hero = document.getElementById("result-hero");
  const grid = document.getElementById("result-grid");
  const detail = document.getElementById("result-detail");
  const title = document.getElementById("result-title");
  const boxGrade = entry => Number.isFinite(entry.presentationGrade) ? entry.presentationGrade : -1;
  let history = null;
  let phase = "closed";
  let videoTimer = null;
  let revealTimer = null;
  let returnFocus = null;
  let savedOverflow = "";
  let progressTime = 0;
  let pendingReopenCount = null;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanName = name => name.replace(/\s*\(거래\s*(?:가능|불가)\)/g, "");
  function clearTimers() {
    clearTimeout(videoTimer);
    clearTimeout(revealTimer);
    videoTimer = revealTimer = null;
  }
  function remoteIcon(name) {
    return "https://media.dsrwiki.com/dsrwiki/item/" + encodeURIComponent(cleanName(name).replace(/:/g,"_").replace(/%/g,"^")) + ".webp";
  }
  function icon(entry, big = false) {
    const tile = document.createElement("span");
    tile.className = "reward-icon" + (big ? " hero-icon" : "");
    tile.dataset.grade = String(entry.item.grade || 1);
    const img = new Image();
    img.alt = cleanName(entry.item.name);
    img.decoding = "async";
    if (!big) img.loading = "lazy";
    img.src = entry.icon ? new URL(entry.icon, assetBase).href : remoteIcon(entry.item.name);
    img.onerror = () => {
      img.onerror = null;
      img.remove();
      const fallback = document.createElement("span");
      fallback.className = "icon-fallback";
      fallback.textContent = cleanName(entry.item.name);
      tile.prepend(fallback);
    };
    const mask = document.createElement("span");
    mask.className = "item-mask";
    mask.textContent = "?";
    mask.setAttribute("aria-hidden","true");
    tile.append(img, mask);
    return tile;
  }
  function selectDetail(index) {
    const entry = history.entries[index];
    detail.querySelector("strong").textContent = tr(cleanName(entry.item.name));
  }
  function renderResults() {
    const first = history.entries[0];
    hero.replaceChildren(icon(first, true));
    hero.dataset.drawIndex = first.drawIndex;
    hero.setAttribute("aria-label", first.item.name+", "+first.item.count+"개");
    const quantity = document.createElement("span");
    quantity.className = "hero-quantity";
    quantity.textContent = "× "+first.item.count;
    hero.append(quantity);
    title.replaceChildren();
    const name = document.createElement("span");
    name.className = "box-name";
    name.textContent = tr(history.name);
    const amount = document.createElement("span");
    amount.className = "open-count";
    amount.textContent = t(history.drawCount+"개", "x"+history.drawCount);
    if (isEnLang) title.append(document.createTextNode("Opened "), name, document.createTextNode(" "), amount, document.createTextNode(" and obtained the following items."));
    else title.append(name, document.createTextNode(" 아이템을 "), amount, document.createTextNode(" 개봉하여 다음 아이템을 획득했습니다."));
    const fragment = document.createDocumentFragment();
    history.entries.forEach((entry, index) => {
      if (index === 0) return; // The entire representative stack is displayed above.
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reward-button";
      button.dataset.index = index;
      button.dataset.drawIndex = entry.drawIndex;
      button.setAttribute("aria-label",entry.item.name+", "+entry.item.count+"개");
      const ordinal = document.createElement("span");
      ordinal.className = "draw-number";
      ordinal.textContent = String(index+1).padStart(2,"0");
      const count = document.createElement("span");
      count.className = "reward-count";
      count.textContent = "× "+entry.item.count;
      button.append(ordinal, icon(entry), count);
      fragment.append(button);
    });
    grid.replaceChildren(fragment);
    grid.parentElement.hidden = history.entries.length === 1;
    grid.parentElement.scrollTop = 0;
    selectDetail(0);
    document.getElementById("result-again").textContent = t(history.drawCount+"개 다시 개봉", "Open "+history.drawCount+" Again");
  }
  function reveal(instant = false, fallback = "") {
    if (phase === "closed") return;
    clearTimers();
    video.pause();
    phase = "results";
    dialog.dataset.phase = phase;
    if (fallback) console.warn(fallback+" · 결과는 재추첨하지 않았습니다.");
    const tiles = [hero.querySelector(".reward-icon"), ...grid.querySelectorAll(".reward-icon")];
    const show = () => {
      tiles.forEach((el, index) => {
        const delay = instant || reducedMotion() ? 0 : Math.min(index * 60, 900);
        el.querySelector(".item-mask").style.transitionDelay = delay+"ms";
        el.classList.add("is-revealed");
      });
    };
    if (instant || reducedMotion()) show();
    else revealTimer = setTimeout(show, 180);
    document.getElementById("result-receive").focus({preventScroll:true});
  }
  function playVideo() {
    phase = "video";
    dialog.dataset.phase = phase;
    const first = history.entries[0];
    const grade = first.presentationGrade || 1;
    video.muted = !document.getElementById("presentation-sound").checked;
    video.volume = .55;
    progressTime = 0;
    video.src = new URL("media/DSR_Random_Gacha_Seq_"+grade+".mp4", assetBase).href;
    video.load();
    videoTimer = setTimeout(() => reveal(false, "영상 로딩 지연으로 결과를 표시했습니다"), 10000);
    const promise = video.play();
    if (promise) promise.catch(() => {if(phase === "video") reveal(false, "영상 재생이 제한되어 결과를 표시했습니다");});
    document.getElementById("result-skip").focus({preventScroll:true});
  }
  function openHistory(play = true) {
    if (!history || !history.entries.length) return;
    clearTimers();
    returnFocus = document.activeElement;
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    renderResults();
    dialog.showModal();
    phase = "results";
    if (play && document.getElementById("presentation-enabled").checked && !reducedMotion()) playVideo();
    else reveal(true);
  }
  function close() {
    clearTimers();
    video.pause();
    phase = "closed";
    dialog.close();
  }
  video.addEventListener("ended", () => {if(phase === "video") reveal();});
  video.addEventListener("error", () => {if(phase === "video") reveal(false,"영상 로딩에 실패해 결과를 표시했습니다");});
  video.addEventListener("timeupdate", () => {
    if (phase !== "video" || video.currentTime <= progressTime) return;
    progressTime = video.currentTime;
    clearTimeout(videoTimer);
    videoTimer = setTimeout(() => reveal(false,"영상이 멈춰 결과를 표시했습니다"), 10000);
  });
  dialog.addEventListener("close", () => {
    clearTimers();
    video.pause();
    phase = "closed";
    document.body.style.overflow = savedOverflow;
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    if (pendingReopenCount !== null) {
      const count = pendingReopenCount;
      pendingReopenCount = null;
      document.getElementById("gacha-count").value = count;
      document.getElementById("open-btn").click();
    }
  });
  dialog.addEventListener("cancel", e => {
    if(phase === "video") {e.preventDefault();reveal();}
  });
  hero.addEventListener("pointerenter", () => selectDetail(0));
  hero.addEventListener("focus", () => selectDetail(0));
  grid.addEventListener("pointerover", e => {
    const button = e.target.closest(".reward-button");
    if(button && !button.contains(e.relatedTarget)) selectDetail(Number(button.dataset.index));
  });
  grid.addEventListener("focusin", e => {
    const button = e.target.closest(".reward-button");
    if(button) selectDetail(Number(button.dataset.index));
  });
  document.getElementById("result-skip").addEventListener("click", () => reveal());
  document.getElementById("result-close").addEventListener("click", close);
  document.getElementById("result-receive").addEventListener("click", close);
  document.getElementById("result-again").addEventListener("click", () => {
    pendingReopenCount = history.drawCount;
    close();
  });
  document.getElementById("presentation-reopen").addEventListener("click", () => openHistory(false));
  window.GachaPresentation = {
    get busy() {return dialog.open;},
    present(box, results) {
      if (!box || !results.length || dialog.open) return;
      const assets = presentationAssets[box.id];
      // Sort a presentation-only copy; preserve draw results, logs and probabilities.
      const ranked = results.map((item, drawIndex) => ({
        item, drawIndex, ...(assets?.items.find(asset => asset.itemName === item.name && asset.itemCount === item.count) || {})
      })).sort((a, b) => Number(b.item.serverNotice === true)-Number(a.item.serverNotice === true)
        || boxGrade(b)-boxGrade(a) || a.drawIndex-b.drawIndex);
      const stacks = new Map();
      for (const entry of ranked) {
        // Full names retain trade restrictions. Quantity is not part of identity.
        const key = JSON.stringify([entry.item.name, entry.item.grade]);
        const stack = stacks.get(key);
        if (stack) stack.item.count += entry.item.count;
        else stacks.set(key, {...entry, item:{...entry.item}});
      }
      // Each stack inherits its highest-priority draw's video and position.
      history = {name:box.name, id:box.id, drawCount:results.length, entries:[...stacks.values()]};
      document.getElementById("presentation-reopen").disabled = false;
      if (document.getElementById("presentation-enabled").checked) openHistory(true);
    }
  };
})();
}
