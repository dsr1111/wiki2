// 기존 app/lazyload.js — 페이지에 추가되는 모든 <img> 에 loading="lazy", decoding="async" 를 붙임
// (기존 사이트에서 진화트리를 뺀 모든 페이지가 쓰던 것. 진화트리는 그대로 제외)
//
// 참고: "첫 화면 이미지는 lazy 에서 빼기"를 시험해 봤지만(이미지마다 화면 안인지 위치 계산),
// 도감처럼 표를 크게 그리는 페이지에서 그 계산 비용 때문에 오히려 느려져서(첫 화면 0.5초 → 1.2초) 되돌림.
function apply(img) {
  if (document.body.classList.contains('page-evolution')) return;
  if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
  if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
}

function setLazyAttributes(target) {
  if (!target) return;
  if (target.tagName === 'IMG') apply(target);
  else target.querySelectorAll?.('img').forEach(apply);
}

// 페이지를 열거나 옮길 때마다 본문의 이미지에 적용
document.addEventListener('astro:page-load', () => setLazyAttributes(document.body));

// 나중에 JS 로 추가되는 이미지에도 적용 (본문이 통째로 바뀌어도 계속 동작)
new MutationObserver((mutations) => {
  for (const m of mutations) {
    m.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) setLazyAttributes(node);
    });
  }
}).observe(document.documentElement, { childList: true, subtree: true });
