// 페이지 시작/정리 도우미
//
// 기존 사이트는 페이지를 옮길 때마다 새로 고침이 일어나서, 각 페이지 JS 가
// DOMContentLoaded 에 맞춰 한 번 실행되고 떠날 때 저절로 정리됐습니다.
// 새 사이트는 새로 고침 없이 본문만 바꾸므로 대신 이렇게 합니다.
//
//  - 그 페이지에 들어올 때마다 init(signal, onReady) 를 실행 (처음 열 때 + 다른 페이지에서 넘어올 때)
//  - onReady(fn): 기존 DOMContentLoaded / load 자리. 모든 init 의 본문이 실행된 뒤에 순서대로 실행
//  - 페이지를 떠날 때 signal 이 abort 됨 → document/window 에 건 이벤트를
//    { signal } 로 걸어 두면 자동으로 풀리고, 타이머는 signal 에 맞춰 직접 정리
//
// 사용:  onPage('deck', init);   // <body data-page="deck"> 일 때만 실행 (Layout.astro 가 주소로 정함)

// 다른 페이지에서 넘어오는 중에는, 새 페이지의 외부 스크립트(예: 캘린더 라이브러리)가
// 다 받아진 뒤 Astro 가 보내는 astro:page-load 에서 시작해야 함
let swapping = false;
document.addEventListener('astro:before-swap', () => { swapping = true; });
document.addEventListener('astro:page-load', () => { swapping = false; });

export function onPage(name, ...inits) {
  let ctrl = null;

  const start = () => {
    const body = document.body;
    if (body.dataset.page !== name) return;
    if (body.dataset.started === name) return; // 같은 화면에서 두 번 실행되지 않게
    body.dataset.started = name;
    ctrl = new AbortController();
    const ready = [];
    const onReady = (fn) => ready.push(fn);
    const safely = (fn) => {
      try {
        const r = fn();
        if (r && typeof r.catch === 'function') r.catch((err) => console.error(`[${name}]`, err));
      } catch (err) {
        console.error(`[${name}] 페이지 시작 오류`, err);
      }
    };
    for (const init of inits) safely(() => init(ctrl.signal, onReady));
    for (const fn of ready) safely(fn);
  };

  document.addEventListener('astro:before-swap', () => {
    ctrl?.abort();
    ctrl = null;
  });
  document.addEventListener('astro:page-load', start);
  if (!swapping) start();
}

// 외부 스크립트를 한 번만 불러옴 (이미 불러왔으면 바로 끝남)
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { loaded.delete(src); reject(new Error('스크립트를 불러오지 못함: ' + src)); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}
