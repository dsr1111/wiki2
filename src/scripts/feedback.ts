// 피드백 창 (Nav.astro 의 <dialog class="fbk">) — 메뉴의 "피드백" 버튼으로 엶.
// 보내면 /api/feedback (worker/functions/feedback.mjs) 이 Supabase 에 저장하고, 관리자는 메인 페이지 #admin 에서 봄.
// 이미지는 올리기 전에 브라우저에서 긴 변 1600px webp 로 줄임 (스크린샷이 보통 수백 KB 로 줄어듦).

const API = '/api/feedback';
const MAX_IMAGES = 3;
const MAX_SIDE = 1600;
const MAX_IMAGE_BYTES = 1.4 * 1024 * 1024; // 서버 한도(1.5MB)보다 조금 작게
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 원본이 이보다 크면 줄이기 전에 거절

type Shot = { dataUrl: string; url: string; node: HTMLElement };

/** 이미지 파일 → 긴 변 MAX_SIDE 이하의 webp data URL (webp 를 못 만드는 브라우저는 jpeg) */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // 투명 PNG 를 jpeg 로 바꿀 때 검게 되지 않게
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  if (blob && blob.size > MAX_IMAGE_BYTES) blob = await toBlob(blob.type, 0.6);
  if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error('too big');
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob!);
  });
}

export function initFeedback(root: ShadowRoot) {
  const dialog = root.querySelector<HTMLDialogElement>('dialog.fbk');
  if (!dialog || typeof dialog.showModal !== 'function') return null; // 아주 오래된 브라우저 → 구글폼 링크로
  const form = dialog.querySelector('form') as HTMLFormElement;
  const done = dialog.querySelector('.fbk__done') as HTMLElement;
  const message = form.elements.namedItem('message') as HTMLTextAreaElement;
  const count = form.querySelector('.fbk__count') as HTMLElement;
  const shotsBox = form.querySelector('.fbk__shots') as HTMLElement;
  const addLabel = form.querySelector('.fbk__add') as HTMLElement;
  const fileInput = addLabel.querySelector('input') as HTMLInputElement;
  const error = form.querySelector('.fbk__error') as HTMLElement;
  const send = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  const fallback = dialog.dataset.fallback || '';
  let shots: Shot[] = [];
  let sending = false;

  const showError = (text: string, withFallback = false) => {
    error.textContent = text;
    if (withFallback && fallback) {
      const a = document.createElement('a');
      a.href = fallback;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '구글폼으로 보내기';
      error.append(' ', a);
    }
  };

  const updateCount = () => {
    count.textContent = `${message.value.length} / 2000`;
  };
  message.addEventListener('input', updateCount);

  const syncShots = () => {
    addLabel.hidden = shots.length >= MAX_IMAGES;
  };

  const removeShot = (shot: Shot) => {
    shots = shots.filter((s) => s !== shot);
    URL.revokeObjectURL(shot.url);
    shot.node.remove();
    syncShots();
  };

  async function addFiles(files: Iterable<File>) {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    error.textContent = '';
    for (const file of list) {
      if (shots.length >= MAX_IMAGES) { showError(`이미지는 ${MAX_IMAGES}장까지 첨부할 수 있어요.`); break; }
      if (file.size > MAX_SOURCE_BYTES) { showError('이미지가 너무 커요. 25MB 이하로 올려 주세요.'); continue; }
      const node = document.createElement('div');
      node.className = 'fbk__shot is-busy';
      shotsBox.insertBefore(node, addLabel);
      const shot: Shot = { dataUrl: '', url: URL.createObjectURL(file), node };
      shots.push(shot);
      syncShots();
      try {
        shot.dataUrl = await shrink(file);
        const img = document.createElement('img');
        img.src = shot.url;
        img.alt = '';
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'fbk__shot-x';
        x.setAttribute('aria-label', '이미지 빼기');
        x.textContent = '×';
        x.addEventListener('click', () => removeShot(shot));
        node.replaceChildren(img, x);
        node.classList.remove('is-busy');
      } catch {
        removeShot(shot);
        showError('이 이미지는 첨부할 수 없어요. PNG, JPG, WEBP 이미지로 다시 시도해 주세요.');
      }
    }
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files) addFiles(fileInput.files);
    fileInput.value = '';
  });
  // 캡처한 화면을 Ctrl+V 로 바로 붙여넣기
  dialog.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault();
      addFiles(files);
    }
  });
  // 끌어다 놓기
  dialog.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  dialog.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  const reset = () => {
    form.reset();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    shots = [];
    shotsBox.querySelectorAll('.fbk__shot').forEach((n) => n.remove());
    syncShots();
    updateCount();
    error.textContent = '';
    form.hidden = false;
    done.hidden = true;
  };

  const isDirty = () => !form.hidden && (message.value.trim() !== '' || shots.length > 0);

  const close = () => {
    if (sending) return;
    if (isDirty() && !confirm('작성 중인 내용이 있어요. 닫을까요?')) return;
    dialog.close();
  };
  dialog.addEventListener('close', () => {
    if (!isDirty()) reset(); // 다 보냈거나 빈 창이면 비우고, 쓰던 중이면 다음에 열 때 이어서 쓰게 둠
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  // 창 바깥(어두운 배경)을 누르면 닫기
  dialog.addEventListener('mousedown', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const text = message.value.trim();
    if (text.length < 2) { showError('내용을 적어 주세요.'); message.focus(); return; }
    if (shots.some((s) => !s.dataUrl)) { showError('이미지를 준비하고 있어요. 잠시 후 다시 눌러 주세요.'); return; }
    const data = new FormData(form);
    const body = {
      category: data.get('category'),
      message: text,
      contact: String(data.get('contact') || '').trim(),
      website: String(data.get('website') || ''),
      page: location.pathname + location.search,
      images: shots.map((s) => s.dataUrl),
    };
    sending = true;
    send.disabled = true;
    send.textContent = '보내는 중...';
    error.textContent = '';
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let json: { error?: string } = {};
      try { json = await res.json(); } catch {}
      if (!res.ok) {
        showError(json.error || '보내지 못했어요. 잠시 후 다시 시도해 주세요.', res.status >= 500 || res.status === 404);
        return;
      }
      form.hidden = true;
      done.hidden = false;
      form.reset();
      updateCount();
      (done.querySelector('button') as HTMLButtonElement).focus();
    } catch {
      showError('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true);
    } finally {
      sending = false;
      send.disabled = false;
      send.textContent = '보내기';
    }
  });

  return {
    open() {
      if (dialog.open) return;
      if (!done.hidden) reset();
      dialog.showModal();
      message.focus();
    },
  };
}
