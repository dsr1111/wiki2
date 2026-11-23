import { t, tr, isEn, loadNames } from '../i18n.js';
// 메인 페이지: 오늘의 장소 + 환율 계산기
// (메인 페이지에 들어올 때마다 init(signal, onReady) 가 실행됨 — page.js 의 onPage)
export function init(signal, onReady) {
async function initLocationSchedule() {
  await window.DSRTime.readyWithin();
  const schedule = {
    "무한 산": ["수요일", "금요일", "일요일"],
    "사막 지대": ["화요일", "목요일", "토요일"],
    "어둠성 계곡": ["월요일", "금요일", "일요일"],
    "현실 세계": ["월요일", "수요일", "토요일"],
    "스파이럴 마운틴": ["월요일", "목요일", "일요일"],
    "데이터 세계": ["화요일", "목요일", "토요일"]
  };

  const locationLinks = {
    "무한 산": "/overflow?map=무한 산",
    "사막 지대": "/overflow?map=사막 지대",
    "어둠성 계곡": "/overflow?map=어둠성 계곡",
    "현실 세계": "/overflow?map=현실 세계",
    "스파이럴 마운틴": "/overflow?map=스파이럴 마운틴",
    "데이터 세계": "/overflow?map=데이터 세계"
  };

  // 오버플로우 맵 이름 (게임 영어판 표기)
  const OVERFLOW_EN = { "무한 산": "Infinity Mountain", "사막 지대": "Desert Area", "어둠성 계곡": "Dark Castle Valley", "현실 세계": "Real World", "스파이럴 마운틴": "Spiral Mt.", "데이터 세계": "Data World" };
  const days = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const todayDay = days[window.DSRTime.kst().weekday]; // 한국 시간 기준 요일

  const locationsToday = [];
  for (const location in schedule) {
    if (schedule[location].includes(todayDay)) {
      locationsToday.push(`<a href="${locationLinks[location]}">${OVERFLOW_EN[location] && isEn() ? OVERFLOW_EN[location] : location}</a>`);
    }
  }

  const overflowContainer = document.querySelector(".overflow");
  if (overflowContainer) {
    const locationDiv = document.createElement("div");
    locationDiv.classList.add("locations-today");
    locationDiv.innerHTML = locationsToday.join("<br>");
    overflowContainer.appendChild(locationDiv);
  }
}

function initCalculator() {
  const currencyInput = document.getElementById("currency-input");
  const currencyType = document.getElementById("currency-type");
  const exchangeRate = document.getElementById("exchange-rate");
  const conversionResult = document.getElementById("conversion-result");

  if (!currencyInput || !currencyType || !exchangeRate || !conversionResult) return;

  function updateConversion() {
    const rateInput = parseFloat(exchangeRate.value);
    const inputValue = parseFloat(currencyInput.value);
    const conversionTypeValue = currencyType.value;

    if (isNaN(rateInput) || isNaN(inputValue)) {
      conversionResult.textContent = "0";
      return;
    }

    let result;
    let unit;

    if (conversionTypeValue === "crown-to-bit") {
      result = inputValue * (rateInput / 100) * 10000;
      unit = t(" 비트", " BIT");
    } else {
      result = inputValue / ((rateInput * 10000) / 100);
      unit = t(" 크라운", " Crown");
    }

    conversionResult.textContent = Math.round(result).toLocaleString() + unit;
  }

  currencyInput.addEventListener("input", updateConversion);
  currencyType.addEventListener("change", updateConversion);
  exchangeRate.addEventListener("input", updateConversion);
}

onReady(function () {
  initLocationSchedule();
  initCalculator();
});
}
