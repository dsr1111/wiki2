// 페이지 이동 때 메뉴가 깜빡이고 새 본문이 잠깐 CSS 없이 보이던 문제 해결
//
// 원인: Astro 는 화면을 바꾸는 순간에 새 페이지의 <link rel="stylesheet"> 를 <head> 에 넣는데,
// 브라우저는 그렇게 넣은 CSS 를 바로 적용하지 않고 잠깐 뒤에 적용함.
// 그 사이에 화면 전환이 찍혀서 CSS 없는 화면(흰 메뉴, 맨 글자)이 0.1초쯤 보였음.
// 지금은 사이트 CSS 가 모두 페이지 HTML 안에 들어가 있어서(<style>) 이 문제가 없고,
// 외부 CSS(메인 페이지의 달력 fullcalendar 등)에만 해당됨.
//
// 해결: 새 페이지 HTML 을 받은 직후, 새 CSS 를 미리 <head> 에 "꺼진 상태"(media="not all")로 넣고
// 다 읽힐 때까지 기다림. 화면을 바꾸는 순간에는 켜기만 하면 되므로 바로 적용됨.
// Astro 는 주소가 같은 CSS 는 그대로 두므로, 미리 넣은 것이 그대로 쓰이고 순서도 새 페이지와 같음.

const EARLY = 'data-early-css';

document.addEventListener('astro:before-preparation', (event) => {
  const originalLoader = event.loader;
  event.loader = async () => {
    await originalLoader();
    const doc = event.newDocument;
    if (!doc || event.signal.aborted) return;
    const waits = [];
    for (const el of doc.head.querySelectorAll('link[rel="stylesheet"]')) {
      const href = el.getAttribute('href');
      const exists = [...document.head.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.getAttribute('href') === href);
      if (exists) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.media = 'not all';
      link.setAttribute(EARLY, el.getAttribute('media') ?? '');
      waits.push(new Promise((resolve) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
      }));
      document.head.append(link);
    }
    // 느린 경우에도 2초 넘게 붙잡지는 않음
    if (waits.length) await Promise.race([Promise.all(waits), new Promise((r) => setTimeout(r, 2000))]);
  };
});

// 화면을 바꾸기 직전에 미리 넣어 둔 CSS 를 켬 (원래 페이지 CSS 는 Astro 가 같은 순간에 뺌)
document.addEventListener('astro:before-swap', () => {
  for (const link of document.head.querySelectorAll(`link[${EARLY}]`)) {
    const media = link.getAttribute(EARLY);
    if (media) link.media = media;
    else link.removeAttribute('media');
    link.removeAttribute(EARLY);
  }
});
