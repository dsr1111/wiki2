// 기존 app/gacha.js, app/gacha-presentation-assets.js, app/gacha-presentation.js 를 옮긴 것
// 파일 전체를 init() 안에 넣어, 이 페이지에 들어올 때마다 처음 상태로 다시 시작합니다.
// (여러 파일은 기존처럼 같은 범위를 쓰도록 실행 순서대로 이어 붙임)
// onReady: 기존 DOMContentLoaded / load 자리 — 원래처럼 나머지 코드가 다 실행된 뒤에 돔
// signal: 페이지를 떠날 때 abort 됨 — document/window 이벤트나 타이머 정리에 사용
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
        line.innerHTML = `<span class="timestamp">[시스템]</span><span>${message}</span>`;
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
    document.getElementById('box-name').textContent = box.name;
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
        addConsoleLine('먼저 상자를 선택해주세요.', true, false, null, outputTarget);
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
        tradeStatusHtml = ' <span class="trade-available">(거래가능)</span>';
    } else if (tradeInfo.tradeStatus === 'unavailable') {
        tradeStatusHtml = ' <span class="trade-unavailable">(거래불가)</span>';
    }

    // 카운터 증가 (번호는 증가 전 값 사용)
    totalOpenCount++;
    const currentLogNumber = totalOpenCount;
    if (!outputTarget) {
        updateCounter();
    }

    const message = `<span style="color: #9cdcfe;">[${currentBox.name}]</span> <span class="${gradeClass}">[${tradeInfo.displayName}]</span> <span class="item-count">${selectedItem.count}개</span>를 획득했습니다.${tradeStatusHtml}`;
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
        modalBody.innerHTML = '<div style="text-align: center; color: #9cdcfe; padding: 40px;">아직 개봉한 상자가 없습니다.</div>';
        return;
    }

    let html = '';

    // 아이템별 상세 통계
    html += '<div class="stats-section">';
    html += '<div class="stats-section-title">아이템별 획득 통계</div>';
    html += '<div class="stats-item-list">';

    // 획득 횟수 순으로 정렬
    const sortedItems = Object.entries(logStats.items)
        .sort((a, b) => b[1].count - a[1].count);

    sortedItems.forEach(([itemName, itemData]) => {
        const percentage = logStats.totalOpens > 0 ? ((itemData.count / logStats.totalOpens) * 100).toFixed(2) : 0;
        const gradeClass = `item-grade-${itemData.grade}`;
        html += `<div class="stats-item-row">
            <span class="stats-item-name ${gradeClass}">${itemData.displayName}</span>
            <span class="stats-item-count">${itemData.count.toLocaleString()}개</span>
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
        addConsoleLine('먼저 상자를 선택해주세요.', true);
        return;
    }

    if (count <= 0 || count > 1000) {
        addConsoleLine('개수는 1~1000 사이여야 합니다.', true);
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
        const response = await fetch('https://media.dsrwiki.com/data/csv/gacha.json');
        gachaData = await response.json();

        // 상자 선택 드롭다운 채우기
        const boxSelect = document.getElementById('box-select');
        gachaData.boxes.forEach(box => {
            const option = document.createElement('option');
            option.value = box.id;
            option.textContent = box.name;
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
                document.getElementById('box-name').textContent = '상자를 선택하세요';
                document.getElementById('box-description').textContent = '';
                const boxOpenContainer = document.getElementById('box-open-container');
                boxOpenContainer.style.opacity = '0.5';
                boxOpenContainer.style.pointerEvents = 'none';
            }
        });
    } catch (error) {
        console.error('가챠 데이터 로드 실패:', error);
        addConsoleLine('가챠 데이터를 불러오는데 실패했습니다.', true);
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
            addConsoleLine('먼저 상자를 선택해주세요.', true);
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
// Local game Box_Grade and icon metadata. Match exact reward name/count, never row position.
window.GACHA_PRESENTATION_ASSETS = {
  "hongryeon": {
    "items": [
      {
        "itemName": "스킬 강화석 변환제",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2015.png"
      },
      {
        "itemName": "마법의 구슬",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25007.png"
      },
      {
        "itemName": "따스한 요람",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/30011.png"
      },
      {
        "itemName": "인벤토리 확장권",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/96.png"
      },
      {
        "itemName": "중급 조합 촉매제",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2102.png"
      },
      {
        "itemName": "확성기 티켓",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/2022.png"
      },
      {
        "itemName": "힘 고정책",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "신형 아크 머리 파츠 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/846.png"
      },
      {
        "itemName": "신형 아크 날개(좌) 파츠 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/847.png"
      },
      {
        "itemName": "신형 아크 날개(우) 파츠 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/848.png"
      },
      {
        "itemName": "신형 아크 꼬리 파츠 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/849.png"
      },
      {
        "itemName": "신형 아크 머리 파츠 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/846.png"
      },
      {
        "itemName": "신형 아크 날개(좌) 파츠 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/847.png"
      },
      {
        "itemName": "신형 아크 날개(우) 파츠 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/848.png"
      },
      {
        "itemName": "신형 아크 꼬리 파츠 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/849.png"
      }
    ]
  },
  "chilheuk": {
    "items": [
      {
        "itemName": "확성기 티켓",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/2022.png"
      },
      {
        "itemName": "힘 고정책",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8010.png"
      },
      {
        "itemName": "제로유니트",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "최하급 스킬 보호석",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2016.png"
      },
      {
        "itemName": "디지코어 인터페이스",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "백조몬의 물뿌리개",
        "itemCount": 8,
        "presentationGrade": 1,
        "icon": "items/702.png"
      },
      {
        "itemName": "EVP데이터 칩(100%)",
        "itemCount": 4,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "진의 장난감 총 (거래 불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/939.png"
      },
      {
        "itemName": "진의 장난감 총 (거래 가능)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": "items/939.png"
      }
    ]
  },
  "cheondung": {
    "items": [
      {
        "itemName": "마법의 구슬 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/25007.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "디지몬 음식 믹서기 (거래가능)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/310.png"
      },
      {
        "itemName": "최하급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2016.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8010.png"
      },
      {
        "itemName": "마법의 구슬 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/25007.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "디지몬 음식 믹서기 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/310.png"
      },
      {
        "itemName": "최하급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2016.png"
      },
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8010.png"
      },
      {
        "itemName": "빛의 기둥 파편 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1008.png"
      },
      {
        "itemName": "조합법 : 황수언월도 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/2365.png"
      },
      {
        "itemName": "황금기사의 낡은 검 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1010.png"
      },
      {
        "itemName": "황금기사의 부서진 검날 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1011.png"
      },
      {
        "itemName": "빛의 기둥 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1008.png"
      },
      {
        "itemName": "조합법 : 황수언월도 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2365.png"
      },
      {
        "itemName": "황금기사의 낡은 검 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1010.png"
      },
      {
        "itemName": "황금기사의 부서진 검날 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1011.png"
      }
    ]
  },
  "ajong": {
    "items": [
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 15,
        "presentationGrade": 1,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 20,
        "presentationGrade": 1,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 25,
        "presentationGrade": 1,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 30,
        "presentationGrade": 2,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 35,
        "presentationGrade": 2,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 40,
        "presentationGrade": 2,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 50,
        "presentationGrade": 2,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 200,
        "presentationGrade": 4,
        "icon": "items/1022.png"
      },
      {
        "itemName": "성스러운 디지코드 (거래가능)",
        "itemCount": 5000,
        "presentationGrade": 5,
        "icon": "items/1022.png"
      },
      {
        "itemName": "융합의 의지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1018.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "부서진 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2007.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "최고급 강화 재료 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2014.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "궁극체 스킬 강화석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2004.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2013.png"
      },
      {
        "itemName": "에보류터 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2018.png"
      },
      {
        "itemName": "홀리 링 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2020.png"
      }
    ]
  },
  "saak": {
    "items": [
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/2003.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/2006.png"
      },
      {
        "itemName": "포텐셜 페이지 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2030.png"
      },
      {
        "itemName": "포텐셜 페이지 확장권 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2030.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래가능)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "디지몬 음식 믹서기 (거래가능)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/310.png"
      },
      {
        "itemName": "디지몬 음식 믹서기 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 1,
        "icon": "items/310.png"
      },
      {
        "itemName": "궁극체 스킬 강화석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2004.png"
      },
      {
        "itemName": "쿠가몬의 팔 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/508.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 마음 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1013.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 마음 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1013.png"
      }
    ]
  },
  "bongin": {
    "items": [
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 3,
        "presentationGrade": 1,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 1,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 6,
        "presentationGrade": 2,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 7,
        "presentationGrade": 2,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 100,
        "presentationGrade": 3,
        "icon": "items/1047.png"
      },
      {
        "itemName": "불길한 광석 (거래가능)",
        "itemCount": 500,
        "presentationGrade": 4,
        "icon": "items/1047.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 영혼 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1009.png"
      },
      {
        "itemName": "불길한 마음의 조각 (거래가능)",
        "itemCount": 100,
        "presentationGrade": 3,
        "icon": "items/1048.png"
      },
      {
        "itemName": "불길한 마음의 조각 (거래가능)",
        "itemCount": 500,
        "presentationGrade": 4,
        "icon": "items/1048.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 4,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "부서진 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2007.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2008.png"
      },
      {
        "itemName": "최고급 강화 재료 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2014.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2003.png"
      }
    ]
  },
  "areum": {
    "items": [
      {
        "itemName": "부서진 릴리몬 디지코어 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/10055.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "유진의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1063.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "활력의 포션 (거래가능)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "부서진 로제몬 디지코어 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/10121.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "유진의 디지소울 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1063.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "부서진 릴리몬 디지코어 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/10055.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2013.png"
      },
      {
        "itemName": "부서진 로제몬 디지코어 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/10121.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2013.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      }
    ]
  },
  "bunno": {
    "items": [
      {
        "itemName": "포텐셜 조각 (거래불가)",
        "itemCount": 7,
        "presentationGrade": 1,
        "icon": "items/8001.png"
      },
      {
        "itemName": "포텐셜 조각 (거래불가)",
        "itemCount": 8,
        "presentationGrade": 1,
        "icon": "items/8001.png"
      },
      {
        "itemName": "포텐셜 조각 (거래불가)",
        "itemCount": 9,
        "presentationGrade": 1,
        "icon": "items/8001.png"
      },
      {
        "itemName": "포텐셜 조각 (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/8001.png"
      },
      {
        "itemName": "포텐셜 조각 (거래불가)",
        "itemCount": 11,
        "presentationGrade": 1,
        "icon": "items/8001.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "분노의 인장 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1091.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "최고급 강화 재료 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2014.png"
      },
      {
        "itemName": "부서진 제로유니트 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2007.png"
      }
    ]
  },
  "bulta": {
    "items": [
      {
        "itemName": "부서진 화이트레오몬 디지코어 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/10150.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "최영재의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1194.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "활력의 포션 (거래가능)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "부서진 반쵸레오몬 디지코어 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/10193.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "최영재의 디지소울 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1194.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "부서진 화이트레오몬 디지코어 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/10150.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2013.png"
      },
      {
        "itemName": "부서진 반쵸레오몬 디지코어 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/10193.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2013.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      }
    ]
  },
  "cheolbyeok": {
    "items": [
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8006.png"
      },
      {
        "itemName": "4% 힘 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8019.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8007.png"
      },
      {
        "itemName": "4% 지능 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8023.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "4% 수비 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8027.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "4% 저항 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8031.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/8010.png"
      },
      {
        "itemName": "4% 속도 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/8035.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "지혜의 포션 (거래불가)",
        "itemCount": 400,
        "presentationGrade": 1,
        "icon": "items/39.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2003.png"
      },
      {
        "itemName": "궁극체 스킬 강화석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2004.png"
      },
      {
        "itemName": "마순 아발론 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1202.png"
      },
      {
        "itemName": "마순 아발론 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1202.png"
      }
    ]
  },
  "jabiroun": {
    "items": [
      {
        "itemName": "지식의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1095.png"
      },
      {
        "itemName": "빛의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1096.png"
      },
      {
        "itemName": "희망의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1097.png"
      },
      {
        "itemName": "순수의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1098.png"
      },
      {
        "itemName": "사랑의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1099.png"
      },
      {
        "itemName": "성실의 기운 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1155.png"
      }
    ]
  },
  "bulmyeol": {
    "items": [
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/8010.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "세번째 덱 기간 확장권 (15일) (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/137.png"
      },
      {
        "itemName": "불멸의 우정 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1277.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "지혜의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/39.png"
      },
      {
        "itemName": "조각난 불멸의 우정 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1278.png"
      },
      {
        "itemName": "프리미엄 디지아일랜드 랜덤 변경권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/900421.png"
      },
      {
        "itemName": "중급 조합 촉매제 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2102.png"
      },
      {
        "itemName": "불멸의 우정 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1277.png"
      },
      {
        "itemName": "조각난 불멸의 우정 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/1278.png"
      }
    ]
  },
  "bulgeunyongje": {
    "items": [
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "쁘띠몬 디지타마 패키지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900855.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래가능)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "쁘띠몬 디지타마 패키지 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900855.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "지혜의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/39.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/2003.png"
      }
    ]
  },
  "taeyang": {
    "items": [
      {
        "itemName": "아구몬(S) 디지타마 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/20066.png"
      },
      {
        "itemName": "디지바이스 프리셋 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2042.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "지혜의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/39.png"
      },
      {
        "itemName": "마법의 구슬 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/25007.png"
      },
      {
        "itemName": "활력의 포션 (거래불가)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/29.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "마법의 구슬 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/25007.png"
      },
      {
        "itemName": "완전한 성숙기 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10004.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "완전한 성숙기 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10004.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래가능)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      }
    ]
  },
  "bukjjok": {
    "items": [
      {
        "itemName": "호메오스타시스의 1번째 구절 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1214.png"
      },
      {
        "itemName": "호메오스타시스의 1번째 구절 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1214.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 4,
        "presentationGrade": 1,
        "icon": "items/2003.png"
      },
      {
        "itemName": "유대감 1% 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": null
      },
      {
        "itemName": "디지몬 보관소 카드 키 (30일) (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2041.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 10,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "에보류터 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 10,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "에보류터 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "지혜의 포션 (거래가능)",
        "itemCount": 800,
        "presentationGrade": 1,
        "icon": "items/39.png"
      },
      {
        "itemName": "거래소 리모컨 (30일) (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2025.png"
      },
      {
        "itemName": "소서리몬의 지팡이 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2019.png"
      }
    ]
  },
  "natae": {
    "items": [
      {
        "itemName": "드라큐몬 디지타마 패키지 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900942.png"
      },
      {
        "itemName": "드라큐몬 디지타마 패키지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900942.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/2032.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 4,
        "icon": "items/2003.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래가능)",
        "itemCount": 1,
        "presentationGrade": null,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "고급 유기농 먹이 팩(랜덤) (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/10001126.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "gunggeukche": {
    "items": [
      {
        "itemName": "부서진 가르프몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10276.png"
      },
      {
        "itemName": "부서진 가르프몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10276.png"
      },
      {
        "itemName": "부서진 가이오몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10325.png"
      },
      {
        "itemName": "부서진 가이오몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10325.png"
      },
      {
        "itemName": "부서진 갓드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10215.png"
      },
      {
        "itemName": "부서진 갓드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10215.png"
      },
      {
        "itemName": "부서진 고크몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10295.png"
      },
      {
        "itemName": "부서진 고크몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10295.png"
      },
      {
        "itemName": "부서진 그랑디스쿠가몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10299.png"
      },
      {
        "itemName": "부서진 그랑디스쿠가몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10299.png"
      },
      {
        "itemName": "부서진 그랜쿠가몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10268.png"
      },
      {
        "itemName": "부서진 그랜쿠가몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10268.png"
      },
      {
        "itemName": "부서진 네오반데몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10201.png"
      },
      {
        "itemName": "부서진 네오반데몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10201.png"
      },
      {
        "itemName": "부서진 넵튠몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10209.png"
      },
      {
        "itemName": "부서진 넵튠몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10209.png"
      },
      {
        "itemName": "부서진 던데블몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10256.png"
      },
      {
        "itemName": "부서진 던데블몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10256.png"
      },
      {
        "itemName": "부서진 데스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10210.png"
      },
      {
        "itemName": "부서진 데스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10210.png"
      },
      {
        "itemName": "부서진 두프트몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10246.png"
      },
      {
        "itemName": "부서진 두프트몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10246.png"
      },
      {
        "itemName": "부서진 듀나스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10245.png"
      },
      {
        "itemName": "부서진 듀나스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10245.png"
      },
      {
        "itemName": "부서진 듀크몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10141.png"
      },
      {
        "itemName": "부서진 듀크몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10141.png"
      },
      {
        "itemName": "부서진 듀크몬:크림슨모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10281.png"
      },
      {
        "itemName": "부서진 듀크몬:크림슨모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10281.png"
      },
      {
        "itemName": "부서진 디아블로몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10152.png"
      },
      {
        "itemName": "부서진 디아블로몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10152.png"
      },
      {
        "itemName": "부서진 레이브몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10267.png"
      },
      {
        "itemName": "부서진 레이브몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10267.png"
      },
      {
        "itemName": "부서진 레이브몬:버스트모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10323.png"
      },
      {
        "itemName": "부서진 레이브몬:버스트모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10323.png"
      },
      {
        "itemName": "부서진 로드나이트몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10247.png"
      },
      {
        "itemName": "부서진 로드나이트몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10247.png"
      },
      {
        "itemName": "부서진 로제몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10121.png"
      },
      {
        "itemName": "부서진 로제몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10121.png"
      },
      {
        "itemName": "부서진 로제몬:버스트모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10312.png"
      },
      {
        "itemName": "부서진 로제몬:버스트모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10312.png"
      },
      {
        "itemName": "부서진 리리스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10236.png"
      },
      {
        "itemName": "부서진 리리스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10236.png"
      },
      {
        "itemName": "부서진 마르스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10269.png"
      },
      {
        "itemName": "부서진 마르스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10269.png"
      },
      {
        "itemName": "부서진 마린엔젤몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10208.png"
      },
      {
        "itemName": "부서진 마린엔젤몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10208.png"
      },
      {
        "itemName": "부서진 마스테몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10227.png"
      },
      {
        "itemName": "부서진 마스테몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10227.png"
      },
      {
        "itemName": "부서진 마왕몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10318.png"
      },
      {
        "itemName": "부서진 마왕몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10318.png"
      },
      {
        "itemName": "부서진 메기드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10220.png"
      },
      {
        "itemName": "부서진 메기드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10220.png"
      },
      {
        "itemName": "부서진 메탈가루몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10122.png"
      },
      {
        "itemName": "부서진 메탈가루몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10122.png"
      },
      {
        "itemName": "부서진 메탈시드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10149.png"
      },
      {
        "itemName": "부서진 메탈시드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10149.png"
      },
      {
        "itemName": "부서진 메탈에테몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10138.png"
      },
      {
        "itemName": "부서진 메탈에테몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10138.png"
      },
      {
        "itemName": "부서진 문밀레니엄몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10307.png"
      },
      {
        "itemName": "부서진 문밀레니엄몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10307.png"
      },
      {
        "itemName": "부서진 밀레니엄몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10228.png"
      },
      {
        "itemName": "부서진 밀레니엄몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10228.png"
      },
      {
        "itemName": "부서진 바이킹몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10123.png"
      },
      {
        "itemName": "부서진 바이킹몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10123.png"
      },
      {
        "itemName": "부서진 반쵸레오몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10193.png"
      },
      {
        "itemName": "부서진 반쵸레오몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10193.png"
      },
      {
        "itemName": "부서진 반쵸레오몬:버스트모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10324.png"
      },
      {
        "itemName": "부서진 반쵸레오몬:버스트모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10324.png"
      },
      {
        "itemName": "부서진 반쵸콩알몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10258.png"
      },
      {
        "itemName": "부서진 반쵸콩알몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10258.png"
      },
      {
        "itemName": "부서진 발두르몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10270.png"
      },
      {
        "itemName": "부서진 발두르몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10270.png"
      },
      {
        "itemName": "부서진 발키리몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10284.png"
      },
      {
        "itemName": "부서진 발키리몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10284.png"
      },
      {
        "itemName": "부서진 백호몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10336.png"
      },
      {
        "itemName": "부서진 백호몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10336.png"
      },
      {
        "itemName": "부서진 베놈묘티스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10136.png"
      },
      {
        "itemName": "부서진 베놈묘티스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10136.png"
      },
      {
        "itemName": "부서진 베르제브몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10216.png"
      },
      {
        "itemName": "부서진 베르제브몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10216.png"
      },
      {
        "itemName": "부서진 베르제브몬:블래스트모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10294.png"
      },
      {
        "itemName": "부서진 베르제브몬:블래스트모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10294.png"
      },
      {
        "itemName": "부서진 베르제브몬(C) 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10217.png"
      },
      {
        "itemName": "부서진 베르제브몬(C) 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10217.png"
      },
      {
        "itemName": "부서진 베리얼묘티스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10316.png"
      },
      {
        "itemName": "부서진 베리얼묘티스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10316.png"
      },
      {
        "itemName": "부서진 블래스트몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10260.png"
      },
      {
        "itemName": "부서진 블래스트몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10260.png"
      },
      {
        "itemName": "부서진 블랙세라피몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10241.png"
      },
      {
        "itemName": "부서진 블랙세라피몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10241.png"
      },
      {
        "itemName": "부서진 블랙워그레이몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10285.png"
      },
      {
        "itemName": "부서진 블랙워그레이몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10285.png"
      },
      {
        "itemName": "부서진 블리츠그레이몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10300.png"
      },
      {
        "itemName": "부서진 블리츠그레이몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10300.png"
      },
      {
        "itemName": "부서진 샤벨레오몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10142.png"
      },
      {
        "itemName": "부서진 샤벨레오몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10142.png"
      },
      {
        "itemName": "부서진 샤인그레이몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10288.png"
      },
      {
        "itemName": "부서진 샤인그레이몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10288.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:루인모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10317.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:루인모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10317.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:버스트모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10319.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:버스트모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10319.png"
      },
      {
        "itemName": "부서진 샤크라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10180.png"
      },
      {
        "itemName": "부서진 샤크라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10180.png"
      },
      {
        "itemName": "부서진 세라피몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10131.png"
      },
      {
        "itemName": "부서진 세라피몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10131.png"
      },
      {
        "itemName": "부서진 세인트가르고몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10191.png"
      },
      {
        "itemName": "부서진 세인트가르고몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10191.png"
      },
      {
        "itemName": "부서진 스컬맘몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10134.png"
      },
      {
        "itemName": "부서진 스컬맘몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10134.png"
      },
      {
        "itemName": "부서진 슬래쉬엔젤몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10251.png"
      },
      {
        "itemName": "부서진 슬래쉬엔젤몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10251.png"
      },
      {
        "itemName": "부서진 아구몬-용기의유대- 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10333.png"
      },
      {
        "itemName": "부서진 아구몬-용기의유대- 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10333.png"
      },
      {
        "itemName": "부서진 아마게몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10309.png"
      },
      {
        "itemName": "부서진 아마게몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10309.png"
      },
      {
        "itemName": "부서진 아포카리몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10259.png"
      },
      {
        "itemName": "부서진 아포카리몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10259.png"
      },
      {
        "itemName": "부서진 알포스브이드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10249.png"
      },
      {
        "itemName": "부서진 알포스브이드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10249.png"
      },
      {
        "itemName": "부서진 오메가몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10275.png"
      },
      {
        "itemName": "부서진 오메가몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10275.png"
      },
      {
        "itemName": "부서진 오메가몬:머시풀모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10321.png"
      },
      {
        "itemName": "부서진 오메가몬:머시풀모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10321.png"
      },
      {
        "itemName": "부서진 오메가몬Alter-S 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10303.png"
      },
      {
        "itemName": "부서진 오메가몬Alter-S 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10303.png"
      },
      {
        "itemName": "부서진 오파니몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10137.png"
      },
      {
        "itemName": "부서진 오파니몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10137.png"
      },
      {
        "itemName": "부서진 오파니몬:폴다운모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10237.png"
      },
      {
        "itemName": "부서진 오파니몬:폴다운모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10237.png"
      },
      {
        "itemName": "부서진 워그레이몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10107.png"
      },
      {
        "itemName": "부서진 워그레이몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10107.png"
      },
      {
        "itemName": "부서진 이바몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10157.png"
      },
      {
        "itemName": "부서진 이바몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10157.png"
      },
      {
        "itemName": "부서진 주작몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10331.png"
      },
      {
        "itemName": "부서진 주작몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10331.png"
      },
      {
        "itemName": "부서진 지드밀레니엄몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10308.png"
      },
      {
        "itemName": "부서진 지드밀레니엄몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10308.png"
      },
      {
        "itemName": "부서진 청룡몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10329.png"
      },
      {
        "itemName": "부서진 청룡몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10329.png"
      },
      {
        "itemName": "부서진 케루비몬(선) 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10327.png"
      },
      {
        "itemName": "부서진 케루비몬(선) 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10327.png"
      },
      {
        "itemName": "부서진 케루비몬(악) 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10328.png"
      },
      {
        "itemName": "부서진 케루비몬(악) 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10328.png"
      },
      {
        "itemName": "부서진 쿠즈하몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10179.png"
      },
      {
        "itemName": "부서진 쿠즈하몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10179.png"
      },
      {
        "itemName": "부서진 쿠즈하몬:무녀모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10255.png"
      },
      {
        "itemName": "부서진 쿠즈하몬:무녀모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10255.png"
      },
      {
        "itemName": "부서진 크레니엄몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10326.png"
      },
      {
        "itemName": "부서진 크레니엄몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10326.png"
      },
      {
        "itemName": "부서진 크레스가루몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10301.png"
      },
      {
        "itemName": "부서진 크레스가루몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10301.png"
      },
      {
        "itemName": "부서진 크로스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10226.png"
      },
      {
        "itemName": "부서진 크로스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10226.png"
      },
      {
        "itemName": "부서진 클라비스엔젤몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10262.png"
      },
      {
        "itemName": "부서진 클라비스엔젤몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10262.png"
      },
      {
        "itemName": "부서진 타이거베스파몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10154.png"
      },
      {
        "itemName": "부서진 타이거베스파몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10154.png"
      },
      {
        "itemName": "부서진 타이타몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10192.png"
      },
      {
        "itemName": "부서진 타이타몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10192.png"
      },
      {
        "itemName": "부서진 파라사이몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10153.png"
      },
      {
        "itemName": "부서진 파라사이몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10153.png"
      },
      {
        "itemName": "부서진 파라오몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10244.png"
      },
      {
        "itemName": "부서진 파라오몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10244.png"
      },
      {
        "itemName": "부서진 파워드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10151.png"
      },
      {
        "itemName": "부서진 파워드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10151.png"
      },
      {
        "itemName": "부서진 페닉스몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10102.png"
      },
      {
        "itemName": "부서진 페닉스몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10102.png"
      },
      {
        "itemName": "부서진 푸쿠몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10257.png"
      },
      {
        "itemName": "부서진 푸쿠몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10257.png"
      },
      {
        "itemName": "부서진 프레시오몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10182.png"
      },
      {
        "itemName": "부서진 프레시오몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10182.png"
      },
      {
        "itemName": "부서진 피노키몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10143.png"
      },
      {
        "itemName": "부서진 피노키몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10143.png"
      },
      {
        "itemName": "부서진 피에몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10198.png"
      },
      {
        "itemName": "부서진 피에몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10198.png"
      },
      {
        "itemName": "부서진 할매몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10293.png"
      },
      {
        "itemName": "부서진 할매몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10293.png"
      },
      {
        "itemName": "부서진 헤라클레스캅테리몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10108.png"
      },
      {
        "itemName": "부서진 헤라클레스캅테리몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10108.png"
      },
      {
        "itemName": "부서진 홀리드라몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10140.png"
      },
      {
        "itemName": "부서진 홀리드라몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10140.png"
      },
      {
        "itemName": "부서진 황금무사몬 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10286.png"
      },
      {
        "itemName": "부서진 황금무사몬 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10286.png"
      },
      {
        "itemName": "부서진 황제드라몬:드래곤모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10239.png"
      },
      {
        "itemName": "부서진 황제드라몬:드래곤모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10239.png"
      },
      {
        "itemName": "부서진 황제드라몬:파이터모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10240.png"
      },
      {
        "itemName": "부서진 황제드라몬:파이터모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10240.png"
      },
      {
        "itemName": "부서진 황제드라몬:팔라딘모드 디지코어",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10282.png"
      },
      {
        "itemName": "부서진 황제드라몬:팔라딘모드 디지코어",
        "itemCount": 3,
        "presentationGrade": 4,
        "icon": "items/10282.png"
      }
    ]
  },
  "jiltu": {
    "items": [
      {
        "itemName": "리바이어몬의 디지메모리 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "리바이어몬의 디지메모리 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "디지바이스 프리셋 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2042.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "마법의 구슬 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/25007.png"
      },
      {
        "itemName": "마법의 구슬 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/25007.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10005.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/10005.png"
      },
      {
        "itemName": "완전한 궁극체 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10006.png"
      },
      {
        "itemName": "1000 NIBBLE (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/7506.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "힘 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "지능 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "수비 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "저항 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      },
      {
        "itemName": "속도 고정책 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      }
    ]
  },
  "gunggeuk-evolution": {
    "items": [
      {
        "itemName": "한지호의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1064.png"
      },
      {
        "itemName": "최영재의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1194.png"
      },
      {
        "itemName": "진의 장난감 총 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/939.png"
      },
      {
        "itemName": "분노의 인장 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1091.png"
      },
      {
        "itemName": "빛의 기둥 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1008.png"
      },
      {
        "itemName": "황수언월도 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1012.png"
      },
      {
        "itemName": "쿠라몬의 데이터 (거래불가)",
        "itemCount": 1000,
        "presentationGrade": 5,
        "icon": "items/1062.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 영혼 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1009.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 마음 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1013.png"
      },
      {
        "itemName": "마순 아발론 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1202.png"
      },
      {
        "itemName": "어둠의 꽃 (거래불가)",
        "itemCount": 40,
        "presentationGrade": 5,
        "icon": "items/1077.png"
      },
      {
        "itemName": "신형 아크 파츠 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900566.png"
      },
      {
        "itemName": "선택받은 자들의 기운 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900712.png"
      }
    ]
  },
  "dalbit": {
    "items": [
      {
        "itemName": "가오몬 디지타마 패키지 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/901001.png"
      },
      {
        "itemName": "가오몬 디지타마 패키지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/901001.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/119.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2006.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "빛나는 제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2008.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 4,
        "icon": "items/2315.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 5,
        "presentationGrade": 3,
        "icon": "items/2315.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 2,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "bada": {
    "items": [
      {
        "itemName": "고래 석상 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1518.png"
      },
      {
        "itemName": "고래 석상 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1518.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/119.png"
      },
      {
        "itemName": "매튜의 하모니카 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2070.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "제로유니트 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 5,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "gunggeuk-evolution-2": {
    "items": [
      {
        "itemName": "한지호의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1064.png"
      },
      {
        "itemName": "최영재의 디지소울 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1194.png"
      },
      {
        "itemName": "진의 장난감 총 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/939.png"
      },
      {
        "itemName": "리바이어몬의 디지메모리 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "오메가 블레이드 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/890.png"
      },
      {
        "itemName": "융합의 의지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1018.png"
      },
      {
        "itemName": "빛의 기둥 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1008.png"
      },
      {
        "itemName": "황수언월도 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1012.png"
      },
      {
        "itemName": "쿠라몬의 데이터 (거래불가)",
        "itemCount": 1000,
        "presentationGrade": 5,
        "icon": "items/1062.png"
      },
      {
        "itemName": "마순 아발론 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1202.png"
      },
      {
        "itemName": "어둠의 꽃 (거래불가)",
        "itemCount": 40,
        "presentationGrade": 5,
        "icon": "items/1077.png"
      },
      {
        "itemName": "신형 아크 파츠 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900566.png"
      },
      {
        "itemName": "선택받은 자들의 기운 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900712.png"
      }
    ]
  },
  "jiok": {
    "items": [
      {
        "itemName": "진의 장난감 총 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/939.png"
      },
      {
        "itemName": "에보류터 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "에보류터 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/119.png"
      },
      {
        "itemName": "베헤모스 시동 키 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/2071.png"
      },
      {
        "itemName": "매튜의 하모니카 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2070.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2032.png"
      },
      {
        "itemName": "키몬 디지타마 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/20054.png"
      },
      {
        "itemName": "키몬 디지타마 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/20054.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 2,
        "presentationGrade": 3,
        "icon": "items/2003.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 5,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "gunggeukche-special": {
    "items": [
      {
        "itemName": "부서진 워그레이몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10107.png"
      },
      {
        "itemName": "부서진 메탈가루몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10122.png"
      },
      {
        "itemName": "부서진 페닉스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10102.png"
      },
      {
        "itemName": "부서진 헤라클레스캅테리몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10108.png"
      },
      {
        "itemName": "부서진 로제몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10121.png"
      },
      {
        "itemName": "부서진 바이킹몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10123.png"
      },
      {
        "itemName": "부서진 세라피몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10131.png"
      },
      {
        "itemName": "부서진 오파니몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10137.png"
      },
      {
        "itemName": "부서진 스컬맘몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10134.png"
      },
      {
        "itemName": "부서진 베놈묘티스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10136.png"
      },
      {
        "itemName": "부서진 메탈에테몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10138.png"
      },
      {
        "itemName": "부서진 홀리드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10140.png"
      },
      {
        "itemName": "부서진 샤벨레오몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10142.png"
      },
      {
        "itemName": "부서진 피노키몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10143.png"
      },
      {
        "itemName": "부서진 디아블로몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10152.png"
      },
      {
        "itemName": "부서진 파라사이몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10153.png"
      },
      {
        "itemName": "부서진 타이거베스파몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10154.png"
      },
      {
        "itemName": "부서진 쿠즈하몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10179.png"
      },
      {
        "itemName": "부서진 샤크라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10180.png"
      },
      {
        "itemName": "부서진 파워드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10151.png"
      },
      {
        "itemName": "부서진 프레시오몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10182.png"
      },
      {
        "itemName": "부서진 이바몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10157.png"
      },
      {
        "itemName": "부서진 세인트가르고몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10191.png"
      },
      {
        "itemName": "부서진 타이타몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10192.png"
      },
      {
        "itemName": "부서진 반쵸레오몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10193.png"
      },
      {
        "itemName": "부서진 피에몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10198.png"
      },
      {
        "itemName": "부서진 네오반데몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10201.png"
      },
      {
        "itemName": "부서진 마린엔젤몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10208.png"
      },
      {
        "itemName": "부서진 넵튠몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10209.png"
      },
      {
        "itemName": "부서진 데스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10210.png"
      },
      {
        "itemName": "부서진 갓드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10215.png"
      },
      {
        "itemName": "부서진 베르제브몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10216.png"
      },
      {
        "itemName": "부서진 베르제브몬(C) 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10217.png"
      },
      {
        "itemName": "부서진 듀크몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10141.png"
      },
      {
        "itemName": "부서진 메기드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10220.png"
      },
      {
        "itemName": "부서진 메탈시드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10149.png"
      },
      {
        "itemName": "부서진 크로스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10226.png"
      },
      {
        "itemName": "부서진 마스테몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10227.png"
      },
      {
        "itemName": "부서진 밀레니엄몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10228.png"
      },
      {
        "itemName": "부서진 리리스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10236.png"
      },
      {
        "itemName": "부서진 오파니몬:폴다운모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10237.png"
      },
      {
        "itemName": "부서진 블랙세라피몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10241.png"
      },
      {
        "itemName": "부서진 파라오몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10244.png"
      },
      {
        "itemName": "부서진 듀나스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10245.png"
      },
      {
        "itemName": "부서진 두프트몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10246.png"
      },
      {
        "itemName": "부서진 로드나이트몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10247.png"
      },
      {
        "itemName": "부서진 알포스브이드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10249.png"
      },
      {
        "itemName": "부서진 슬래쉬엔젤몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10251.png"
      },
      {
        "itemName": "부서진 황제드라몬:드래곤모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10239.png"
      },
      {
        "itemName": "부서진 황제드라몬:파이터모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10240.png"
      },
      {
        "itemName": "부서진 쿠즈하몬:무녀모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10255.png"
      },
      {
        "itemName": "부서진 던데블몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10256.png"
      },
      {
        "itemName": "부서진 푸쿠몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10257.png"
      },
      {
        "itemName": "부서진 반쵸콩알몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10258.png"
      },
      {
        "itemName": "부서진 아포카리몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10259.png"
      },
      {
        "itemName": "부서진 블래스트몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10260.png"
      },
      {
        "itemName": "부서진 클라비스엔젤몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10262.png"
      },
      {
        "itemName": "부서진 그랜쿠가몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10268.png"
      },
      {
        "itemName": "부서진 마르스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10269.png"
      },
      {
        "itemName": "부서진 레이브몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10267.png"
      },
      {
        "itemName": "부서진 발두르몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10270.png"
      },
      {
        "itemName": "부서진 오메가몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10275.png"
      },
      {
        "itemName": "부서진 가르프몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10276.png"
      },
      {
        "itemName": "부서진 듀크몬:크림슨모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10281.png"
      },
      {
        "itemName": "부서진 황제드라몬:팔라딘 모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10282.png"
      },
      {
        "itemName": "부서진 발키리몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10284.png"
      },
      {
        "itemName": "부서진 블랙워그레이몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10285.png"
      },
      {
        "itemName": "부서진 황금무사몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10286.png"
      },
      {
        "itemName": "부서진 샤인그레이몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10288.png"
      },
      {
        "itemName": "부서진 할매몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10293.png"
      },
      {
        "itemName": "부서진 베르제브몬:블래스트모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10294.png"
      },
      {
        "itemName": "부서진 고크몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10295.png"
      },
      {
        "itemName": "부서진 그랑디스쿠가몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10299.png"
      },
      {
        "itemName": "부서진 블리츠그레이몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10300.png"
      },
      {
        "itemName": "부서진 크레스가루몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10301.png"
      },
      {
        "itemName": "부서진 오메가몬Alter-S 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10303.png"
      },
      {
        "itemName": "부서진 문밀레니엄몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10307.png"
      },
      {
        "itemName": "부서진 지드밀레니엄몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10308.png"
      },
      {
        "itemName": "부서진 아마게몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10309.png"
      },
      {
        "itemName": "부서진 로제몬:버스트모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10312.png"
      },
      {
        "itemName": "부서진 베리얼묘티스몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10316.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:루인모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10317.png"
      },
      {
        "itemName": "부서진 마왕몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10318.png"
      },
      {
        "itemName": "부서진 샤인그레이몬:버스트모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10319.png"
      },
      {
        "itemName": "부서진 오메가몬:머시풀모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10321.png"
      },
      {
        "itemName": "부서진 레이브몬:버스트모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10323.png"
      },
      {
        "itemName": "부서진 반쵸레오몬:버스트모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10324.png"
      },
      {
        "itemName": "부서진 가이오몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10325.png"
      },
      {
        "itemName": "부서진 크레니엄몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10326.png"
      },
      {
        "itemName": "부서진 케루비몬(선) 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10327.png"
      },
      {
        "itemName": "부서진 케루비몬(악) 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10328.png"
      },
      {
        "itemName": "부서진 청룡몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10329.png"
      },
      {
        "itemName": "부서진 주작몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10331.png"
      },
      {
        "itemName": "부서진 아구몬-용기의유대- 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10333.png"
      },
      {
        "itemName": "부서진 백호몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10336.png"
      },
      {
        "itemName": "부서진 파피몬-우정의유대- 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10341.png"
      },
      {
        "itemName": "부서진 슬레이프몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10342.png"
      },
      {
        "itemName": "부서진 저스티몬:액셀암 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10343.png"
      },
      {
        "itemName": "부서진 현무몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10347.png"
      },
      {
        "itemName": "부서진 황룡몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10349.png"
      },
      {
        "itemName": "부서진 저스티몬:블리츠암 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10350.png"
      },
      {
        "itemName": "부서진 리바이어몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10351.png"
      },
      {
        "itemName": "부서진 엑자몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10355.png"
      },
      {
        "itemName": "부서진 브레이크드라몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10356.png"
      },
      {
        "itemName": "부서진 벨페몬:슬립모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10360.png"
      },
      {
        "itemName": "부서진 킹고래몬 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10362.png"
      },
      {
        "itemName": "부서진 저스티몬:크리티컬암 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10363.png"
      },
      {
        "itemName": "부서진 벨페몬:레이지모드 디지코어 (거래불가)",
        "itemCount": 50,
        "presentationGrade": 5,
        "icon": "items/10365.png"
      }
    ]
  },
  "gaehwa": {
    "items": [
      {
        "itemName": "주인 없는 꽃의 창 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1662.png"
      },
      {
        "itemName": "주인 없는 꽃의 창 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1662.png"
      },
      {
        "itemName": "에보류터 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/119.png"
      },
      {
        "itemName": "분홍색 곰인형 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25008.png"
      },
      {
        "itemName": "분홍색 곰인형 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25008.png"
      },
      {
        "itemName": "매튜의 하모니카 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2070.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2032.png"
      },
      {
        "itemName": "중급 스킬 보호석 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2032.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 4,
        "presentationGrade": 2,
        "icon": "items/2003.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래불가)",
        "itemCount": 4,
        "presentationGrade": 2,
        "icon": "items/2003.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "lilith-secret": {
    "items": [
      {
        "itemName": "리리스몬의 목줄 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1673.png"
      },
      {
        "itemName": "리리스몬의 목줄 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1673.png"
      },
      {
        "itemName": "전갈몬의 디지코어 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 3,
        "icon": "items/1677.png"
      },
      {
        "itemName": "전갈몬의 디지코어 (거래가능)",
        "itemCount": 10,
        "presentationGrade": 3,
        "icon": "items/1677.png"
      },
      {
        "itemName": "전갈몬의 디지코어 (거래가능)",
        "itemCount": 15,
        "presentationGrade": 3,
        "icon": "items/1677.png"
      },
      {
        "itemName": "전갈몬의 디지코어 (거래가능)",
        "itemCount": 20,
        "presentationGrade": 4,
        "icon": "items/1677.png"
      },
      {
        "itemName": "전갈몬의 디지코어 (거래가능)",
        "itemCount": 40,
        "presentationGrade": 4,
        "icon": "items/1677.png"
      },
      {
        "itemName": "매튜의 하모니카 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2070.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2013.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2013.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "infected-ancient-dragon": {
    "items": [
      {
        "itemName": "감염된 DNA (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1694.png"
      },
      {
        "itemName": "감염된 DNA (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1694.png"
      },
      {
        "itemName": "DNA 감염 인자 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 3,
        "icon": "items/1705.png"
      },
      {
        "itemName": "DNA 감염 인자 (거래가능)",
        "itemCount": 10,
        "presentationGrade": 3,
        "icon": "items/1705.png"
      },
      {
        "itemName": "DNA 감염 인자 (거래가능)",
        "itemCount": 15,
        "presentationGrade": 3,
        "icon": "items/1705.png"
      },
      {
        "itemName": "DNA 감염 인자 (거래가능)",
        "itemCount": 20,
        "presentationGrade": 4,
        "icon": "items/1705.png"
      },
      {
        "itemName": "DNA 감염 인자 (거래가능)",
        "itemCount": 40,
        "presentationGrade": 4,
        "icon": "items/1705.png"
      },
      {
        "itemName": "부서진 제로유니트 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2064.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 4,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "홀리 링 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2020.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  },
  "gunggeuk-evolution-3": {
    "items": [
      {
        "itemName": "호메오스타시스의 1번째 구절 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1214.png"
      },
      {
        "itemName": "호메오스타시스의 2번째 구절 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1212.png"
      },
      {
        "itemName": "호메오스타시스의 3번째 구절 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1203.png"
      },
      {
        "itemName": "호메오스타시스의 4번째 구절 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1213.png"
      },
      {
        "itemName": "분노의 인장 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1091.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 영혼 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1009.png"
      },
      {
        "itemName": "밀레니엄몬의 어둠의 마음 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1013.png"
      },
      {
        "itemName": "진의 장난감 총 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/939.png"
      },
      {
        "itemName": "리바이어몬의 디지메모리 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "오메가 블레이드 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/890.png"
      },
      {
        "itemName": "융합의 의지 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1018.png"
      },
      {
        "itemName": "빛의 기둥 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1008.png"
      },
      {
        "itemName": "황수언월도 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1012.png"
      },
      {
        "itemName": "마순 아발론 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1202.png"
      },
      {
        "itemName": "신형 아크 파츠 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900566.png"
      },
      {
        "itemName": "선택받은 자들의 기운 선택 상자 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/900712.png"
      }
    ]
  },
  "alphamon-surrendered-maiden": {
    "items": [
      {
        "itemName": "쿠즈하몬의 제사 도구 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/738.png"
      },
      {
        "itemName": "쿠즈하몬의 제사 도구 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/738.png"
      },
      {
        "itemName": "알파몬에게 굴복한 악마 상자 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/901172.png"
      },
      {
        "itemName": "알파몬에게 굴복한 무녀 상자 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/901171.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "에보류터 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "마법의 구슬 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25007.png"
      },
      {
        "itemName": "부서진 제로유니트 파편 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/2064.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 3,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 5,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 2,
        "presentationGrade": 1,
        "icon": "items/2003.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 2,
        "presentationGrade": null,
        "icon": "items/10900977.png"
      },
      {
        "itemName": "힘 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8006.png"
      },
      {
        "itemName": "지능 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8007.png"
      },
      {
        "itemName": "수비 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8008.png"
      },
      {
        "itemName": "저항 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8009.png"
      },
      {
        "itemName": "속도 고정책 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/8010.png"
      }
    ]
  },
  "alphamon-surrendered-demon": {
    "items": [
      {
        "itemName": "리바이어몬의 디지메모리 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "리바이어몬의 디지메모리 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1427.png"
      },
      {
        "itemName": "13번째 공백의 좌 상자 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/901173.png"
      },
      {
        "itemName": "알파몬에게 굴복한 무녀 상자 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/901171.png"
      },
      {
        "itemName": "디지아일랜드 효과 랜덤 변경권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2079.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "에보류터 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "포텐셜 페이지 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2030.png"
      },
      {
        "itemName": "홀리 링 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2020.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "마법의 구슬 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25007.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 10,
        "presentationGrade": 2,
        "icon": "items/2315.png"
      },
      {
        "itemName": "제로유니트 (거래가능)",
        "itemCount": 10,
        "presentationGrade": 2,
        "icon": "items/2006.png"
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      },
      {
        "itemName": "완전체 스킬 강화석 (거래가능)",
        "itemCount": 4,
        "presentationGrade": 1,
        "icon": "items/2003.png"
      }
    ]
  },
  "thirteenth-empty-seat": {
    "items": [
      {
        "itemName": "공백의 인장 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1724.png"
      },
      {
        "itemName": "공백의 인장 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 5,
        "icon": "items/1724.png"
      },
      {
        "itemName": "알파몬에게 굴복한 무녀 상자 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/901171.png"
      },
      {
        "itemName": "완전한 궁극체 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10006.png"
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "에보류터 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "세번째 덱 기간 확장권 (30일) (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/136.png"
      },
      {
        "itemName": "디지아일랜드 외형 랜덤 변경권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2078.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "포텐셜 페이지 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2030.png"
      },
      {
        "itemName": "홀리 링 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2020.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "디지코어 인터페이스 (거래불가)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/2315.png"
      },
      {
        "itemName": "완전한 성숙기 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 1,
        "icon": "items/10004.png"
      }
    ]
  },
  "ultimate-ouryuken": {
    "items": [
      {
        "itemName": "왕룡검 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 5
      },
      {
        "itemName": "완전한 완전체 디지코어 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/10005.png"
      },
      {
        "itemName": "에보류터 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 4,
        "icon": "items/2018.png"
      },
      {
        "itemName": "세번째 덱 기간 확장권 (30일) (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/136.png"
      },
      {
        "itemName": "디지아일랜드 외형 랜덤 변경권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2078.png"
      },
      {
        "itemName": "유대감 1% 증가 물약 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/119.png"
      },
      {
        "itemName": "분홍색 곰인형 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/25008.png"
      },
      {
        "itemName": "홀리 링 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2020.png"
      },
      {
        "itemName": "돌연변이 치료제 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 3,
        "icon": "items/2013.png"
      },
      {
        "itemName": "최하급 스킬 보호석 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 2,
        "icon": "items/2016.png"
      },
      {
        "itemName": "완전한 성숙기 디지코어 (거래불가)",
        "itemCount": 1,
        "presentationGrade": 2,
        "icon": "items/10004.png"
      },
      {
        "itemName": "변신 물약 랜덤 박스 (거래가능)",
        "itemCount": 5,
        "presentationGrade": 1
      },
      {
        "itemName": "창고 확장권 (거래가능)",
        "itemCount": 1,
        "presentationGrade": 1
      },
      {
        "itemName": "EVP데이터 칩(100%) (거래가능)",
        "itemCount": 10,
        "presentationGrade": 1,
        "icon": "items/63.png"
      }
    ]
  }
};

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
      <div class="presentation-topbar"><button type="button" id="result-close" aria-label="결과 화면 닫기">닫기 ×</button></div>
      <div class="result-stage"><div class="hero-rays" aria-hidden="true"></div><button type="button" class="hero-item" id="result-hero"></button></div>
      <h2 class="result-heading" id="result-title"></h2>
      <div class="result-grid-wrap"><div class="result-grid" id="result-grid" aria-label="공지 우선, Box_Grade 높은 순으로 표시한 획득 보상"></div></div>
      <div class="result-detail" id="result-detail" aria-live="polite"><strong></strong></div>
      <div class="result-actions"><button type="button" class="secondary" id="result-again">다시 개봉</button><button type="button" id="result-receive">확인</button></div>
    </section>
    <section class="result-video" aria-label="게임 원본 개봉 영상">
      <video id="result-movie" playsinline preload="none"></video>
      <div class="video-controls"><button type="button" id="result-skip">건너뛰기</button></div>
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
    detail.querySelector("strong").textContent = cleanName(entry.item.name);
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
    name.textContent = history.name;
    const amount = document.createElement("span");
    amount.className = "open-count";
    amount.textContent = history.drawCount+"개";
    title.append(name, document.createTextNode(" 아이템을 "), amount, document.createTextNode(" 개봉하여 다음 아이템을 획득했습니다."));
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
    document.getElementById("result-again").textContent = history.drawCount+"개 다시 개봉";
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
      const assets = window.GACHA_PRESENTATION_ASSETS?.[box.id];
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
