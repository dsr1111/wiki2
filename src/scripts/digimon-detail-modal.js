// 도감에서 디지몬 이름을 누르면 상세 페이지로 넘어가지 않고 모달로 띄움.
// - 모달 안에는 상세 페이지(/detail?name=…&embed=1)를 그대로 띄움(iframe): 상세 화면 코드·CSS 를 한 곳에서만 관리하고,
//   도감 CSS 와 상세 CSS 가 서로 섞이지 않게 하려는 것. embed=1 이면 상세 페이지가 메뉴·위 여백을 숨김 (detail.astro)
// - 열면 주소를 /detail?name=… 으로 바꿔 둠 → 링크 공유 가능, 뒤로가기(휴대폰 포함)는 페이지 이동 대신 모달만 닫음
// - Ctrl/⌘/가운데 버튼 클릭은 원래대로 새 탭에서 상세 페이지를 엶
// - 표·검색·필터·스크롤은 그대로 남아 있어서 닫으면 보던 자리로 돌아옴

const detailUrl = (name, embed) => `/detail?name=${encodeURIComponent(name)}${embed ? '&embed=1' : ''}`;

function buildDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'dex-modal';
  dialog.setAttribute('aria-labelledby', 'dex-modal-title');
  dialog.innerHTML = `
    <div class="dex-modal__bar">
      <h2 id="dex-modal-title" class="dex-modal__title"></h2>
      <a class="dex-modal__tab" target="_blank" rel="noopener" title="새 탭에서 열기" aria-label="새 탭에서 열기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
      </a>
      <button type="button" class="dex-modal__close" aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="dex-modal__body">
      <div class="dex-modal__loading" aria-hidden="true"></div>
      <iframe class="dex-modal__frame" title="디지몬 상세 정보"></iframe>
    </div>`;
  document.body.appendChild(dialog);
  return dialog;
}

export function initDetailModal(signal) {
  const table = document.getElementById('characterTable');
  if (!table || typeof HTMLDialogElement !== 'function') return; // 아주 오래된 브라우저 → 링크대로 상세 페이지

  const dialog = buildDialog();
  const title = dialog.querySelector('.dex-modal__title');
  const tabLink = dialog.querySelector('.dex-modal__tab');
  const frame = dialog.querySelector('iframe');
  const body = dialog.querySelector('.dex-modal__body');
  const pageTitle = document.title;
  signal.addEventListener('abort', () => dialog.remove());

  // 화면 모드(라이트/다크)를 모달 안 상세 페이지에도 똑같이 (메뉴에서 바꾸면 바로 따라 바뀜)
  const syncTheme = () => {
    const doc = frame.contentDocument;
    if (doc?.documentElement) doc.documentElement.dataset.theme = document.documentElement.dataset.theme || 'light';
  };
  const themeWatch = new MutationObserver(syncTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', () => themeWatch.disconnect());
  frame.addEventListener('load', () => {
    syncTheme();
    body.classList.remove('is-loading');
  });

  let current = null;
  // 열 때 비워 둔 도감 기록의 Astro 상태 (닫으면 되돌림). 아래 "뒤로/앞으로가기" 설명 참고
  let savedState;
  const onDetailUrl = () => location.pathname.replace(/\/$/, '') === '/detail';

  /** 모달 열기. push: 주소를 바꾸고 기록을 남길지 (뒤로가기로 다시 열 때는 false) */
  function show(name, push) {
    if (push) {
      if (history.state !== null) {
        savedState = history.state;
        history.replaceState(null, '', location.href);
      }
      history.pushState(null, '', detailUrl(name));
    }
    title.textContent = name;
    tabLink.href = detailUrl(name);
    document.title = `${name} | DSR WIKI`;
    if (current !== name) {
      body.classList.add('is-loading');
      if (!frame.getAttribute('src')) frame.src = detailUrl(name, true);
      else frame.contentWindow.location.replace(detailUrl(name, true)); // 기록을 남기지 않고 바꿈 (뒤로가기가 꼬이지 않게)
      current = name;
    }
    if (!dialog.open) dialog.showModal();
  }

  function hide() {
    if (dialog.open) dialog.close();
    document.title = pageTitle;
    // 도감 기록으로 돌아왔으면 Astro 상태를 되돌려 둠 (다른 페이지로 갔다가 돌아올 때 Astro 가 쓰는 값)
    if (savedState !== undefined && !onDetailUrl()) {
      history.replaceState(savedState, '', location.href);
      savedState = undefined;
    }
  }

  /** 닫기 버튼·Esc·바깥 클릭: 열 때 남긴 기록이 있으면 뒤로가기로 닫음 (주소도 /digimon 으로 돌아옴) */
  function requestClose() {
    if (onDetailUrl()) history.back();
    else hide();
  }

  table.addEventListener('click', (e) => {
    const link = e.target.closest?.('a.digimon-link');
    if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); // Astro 의 페이지 이동도 막힘 (preventDefault 된 클릭은 무시함)
    show(link.textContent.trim(), true);
  }, { signal });

  dialog.querySelector('.dex-modal__close').addEventListener('click', requestClose);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); requestClose(); }); // Esc
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) requestClose(); }); // 어두운 배경
  dialog.addEventListener('close', () => { document.title = pageTitle; });

  // 뒤로/앞으로가기: Astro 는 상태(state)가 있는 기록으로 이동하면 페이지를 다시 그리고, 상태가 null 인 기록은 무시함.
  // 그래서 모달을 열 때 도감 기록의 상태를 잠시 null 로 비우고(위 savedState), 모달 기록도 null 로 남김
  // → 모달 ↔ 도감 사이 이동은 Astro 가 건드리지 않고, 여기서 모달만 열고 닫음 (표·필터·스크롤 유지)
  window.addEventListener('popstate', (e) => {
    if (e.state !== null) return;
    if (onDetailUrl()) {
      const name = new URLSearchParams(location.search).get('name');
      if (name) show(name, false);
    } else if (dialog.open) {
      hide();
    }
  }, { signal });

  // 모달을 연 채로 새로고침하거나 다른 페이지로 갔다가 돌아오는 경우는 주소(/detail)대로 상세 페이지가 뜸
}
