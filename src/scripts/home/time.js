// 메인 페이지: 서버 시각 (window.DSRTime)
// (메인 페이지에 들어올 때마다 init(signal, onReady) 가 실행됨 — page.js 의 onPage)
export function init(signal, onReady) {
// ===== 서버 시간 (한국 시간) =====
// 보는 사람의 PC 시계가 틀려도 쿠폰 마감, 이벤트 캘린더, 오늘의 장소가 맞도록 서버 시각을 씁니다.
// 메인 페이지의 쿠폰·캘린더·오늘의 장소·레이드 타이머가 모두 이 시계를 씁니다. 시간 API가 실패하면 이 사이트 응답의 Date 헤더, 그래도 안 되면 PC 시계를 씁니다.
window.DSRTime = (() => {
  const TIME_API = "https://dsr-time-api.s97716.workers.dev";
  let offset = 0; // 서버 시각 - PC 시각 (ms)
  let synced = false;
  const ready = (async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(TIME_API, { cache: "no-store" });
      const data = await res.json();
      const t1 = Date.now();
      const server = Number(data.timestamp) || new Date(data.utcTime || data.time).getTime();
      if (Number.isFinite(server)) { offset = server - (t0 + t1) / 2; synced = true; return; }
    } catch (e) { /* 다음 방법 */ }
    try {
      const t0 = Date.now();
      const res = await fetch(`${location.origin}/?t=${t0}`, { method: "HEAD", cache: "no-store" });
      const t1 = Date.now();
      const server = new Date(res.headers.get("date")).getTime();
      if (Number.isFinite(server)) { offset = server - (t0 + t1) / 2; synced = true; }
    } catch (e) { /* PC 시계 사용 */ }
  })();
  const now = () => new Date(Date.now() + offset);
  /** 한국 시간의 연/월/일/시/분/초/요일 */
  const kst = (date = now()) => {
    const d = new Date(date.getTime() + 9 * 3600 * 1000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: d.getUTCDay() };
  };
  /** 한국 시간 벽시계 문자열 "YYYY-MM-DDTHH:mm:ss" */
  const kstWall = (date = now()) => new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19);
  /** 시간 동기화를 최대 ms 만큼만 기다림 (느려도 화면이 멈추지 않게) */
  const readyWithin = (ms = 1500) => Promise.race([ready, new Promise((r) => setTimeout(r, ms))]);
  return { ready, readyWithin, now, kst, kstWall, get offset() { return offset; }, get synced() { return synced; } };
})();
}
