import { t, tr, isEn, loadNames } from '../i18n.js';
// 메인 페이지: 이벤트 캘린더 (기존 app/calendar.js)
// (메인 페이지에 들어올 때마다 init(signal, onReady) 가 실행됨 — page.js 의 onPage)
export function init(signal, onReady) {
// 이벤트 캘린더 — 위키 Supabase(site_events)에서 읽고, 실패하면 calendar.json을 사용합니다.
const CALENDAR_FALLBACK_URL = "https://media.dsrwiki.com/data/csv/calendar.json";
window.DSRCalendar = { reload: async () => {} };

function escapeCalendarHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// 캘린더는 한국 시간으로 표시합니다. FullCalendar 를 UTC 모드로 두고 모든 시각을
// "한국 시간 벽시계 문자열"(시간대 표시 없음)로 넘기면, 보는 사람 PC의 시간대와 상관없이 그대로 보입니다.
const serverNow = () => (window.DSRTime ? window.DSRTime.now() : new Date());
const kstWallOf = (date) => new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19);
/** "…+00:00" / "…Z" 처럼 시간대가 붙은 값은 한국 시간으로 바꾸고, 시간대 없는 값(calendar.json)은 이미 한국 시간으로 봄 */
function toKstWall(value) {
  if (!value) return value;
  const s = String(value);
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : kstWallOf(d);
  }
  return s;
}
/** 한국 시간 벽시계 문자열 → 비교용 Date (UTC 로 해석) */
const wallToDate = (wall) => new Date(`${String(wall).slice(0, 19)}Z`);

function toCalendarEvent(event) {
  if (!event || !event.title || !event.start) return null;
  const mapped = { title: event.title, start: toKstWall(event.start) };
  if (event.id) mapped.id = event.id;
  if (event.end) mapped.end = toKstWall(event.end);
  if (event.backgroundColor) {
    mapped.backgroundColor = event.backgroundColor;
    mapped.borderColor = event.backgroundColor;
  }
  if (event.textColor) mapped.textColor = event.textColor;
  return mapped;
}

async function loadCalendarEvents() {
  try {
    if (!window.DSRSupabase) throw new Error("Supabase 설정 없음");
    // 너무 오래된 이벤트는 빼고 불러옵니다 (종료 후 120일까지)
    const since = new Date(serverNow().getTime() - 120 * 864e5).toISOString();
    const rows = await window.DSRSupabase.select("site_events",
      "select=id,title,starts_at,ends_at,background_color,text_color"
      + `&or=(ends_at.is.null,ends_at.gte.${encodeURIComponent(since)})`
      + "&order=starts_at.asc");
    return rows.map((r) => toCalendarEvent({
      id: r.id, title: r.title, start: r.starts_at, end: r.ends_at,
      backgroundColor: r.background_color, textColor: r.text_color,
    })).filter(Boolean);
  } catch (error) {
    console.warn("이벤트 DB를 불러오지 못해 calendar.json을 사용합니다:", error);
    const response = await fetch(CALENDAR_FALLBACK_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()).map(toCalendarEvent).filter(Boolean);
  }
}

// 빠르게 뜨도록:
//  - 캘린더 라이브러리는 쓰는 것(월간·목록 보기)만 이 사이트 안에 같이 묶어 둠 (예전: 외부 CDN 에서 전체 묶음)
//  - 라이브러리 받기·이벤트 DB 읽기를 페이지 시작과 동시에 같이 시작 (예전: 하나 끝나면 다음 것)
//  - 지난번에 받은 이벤트를 저장해 두었다가 먼저 그리고, 새 데이터가 오면 바꿔 끼움
const CALENDAR_CACHE_KEY = "dsrCalendarEvents";
const calendarLibPromise = Promise.all([
  import("@fullcalendar/core"),
  import("@fullcalendar/daygrid"),
  import("@fullcalendar/list"),
  import("@fullcalendar/core/locales/ko"),
]).then(([core, dayGrid, list, ko]) => ({
  Calendar: core.Calendar,
  plugins: [dayGrid.default, list.default],
  locale: ko.default,
}));
const calendarEventsPromise = document.getElementById("event-calendar") ? loadCalendarEvents() : null;
calendarEventsPromise?.catch(() => {}); // 실패는 아래에서 처리
const readCalendarCache = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CALENDAR_CACHE_KEY) || "null");
    return Array.isArray(v) ? v : null;
  } catch { return null; }
};
const writeCalendarCache = (events) => {
  try { localStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(events)); } catch { /* 저장소 차단 */ }
};

onReady(async () => {
  const calendarHost = document.getElementById("event-calendar");
  const emptyMessageEl = document.getElementById("calendar-empty-message");

  if (!calendarHost) {
    return;
  }

  let calendarLib;
  try {
    calendarLib = await calendarLibPromise;
  } catch (error) {
    console.error("캘린더 스크립트를 불러오지 못했습니다.", error);
    if (emptyMessageEl) {
      emptyMessageEl.textContent = t("캘린더 스크립트를 불러오지 못했습니다.", "Could not load the calendar.");
      emptyMessageEl.hidden = false;
    }
    return;
  }
  if (signal.aborted) return;

  const ensureTooltip = (() => {
    let tooltip = document.querySelector(".custom-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "custom-tooltip";
      tooltip.style.display = "none";
      tooltip.innerHTML =
        '<div class="tooltip-arrow"></div><div class="tooltip-content"></div>';
      document.body.appendChild(tooltip);
    }
    const content = tooltip.querySelector(".tooltip-content");
    return { tooltip, content };
  })();

  const { tooltip, content: tooltipContent } = ensureTooltip;
  let pinnedEventEl = null;

  const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });

  const extractClientPoint = (event) => {
    if (!event) {
      return { x: 0, y: 0 };
    }

    if (event.touches && event.touches.length > 0) {
      return {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    }

    if (event.changedTouches && event.changedTouches.length > 0) {
      return {
        x: event.changedTouches[0].clientX,
        y: event.changedTouches[0].clientY,
      };
    }

    return {
      x: event.clientX ?? 0,
      y: event.clientY ?? 0,
    };
  };

  const positionTooltip = (event) => {
    const point = extractClientPoint(event);
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = point.x - (tooltipRect.width / 2);
    let top = point.y + 16;

    if (left + tooltipRect.width > window.innerWidth - 12) {
      left = window.innerWidth - tooltipRect.width - 12;
    }
    if (top + tooltipRect.height > window.innerHeight - 12) {
      top = window.innerHeight - tooltipRect.height - 12;
    }

    tooltip.style.left = `${Math.max(12, left)}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  };

  const buildEventPeriod = (startDate, endDate) => {
    if (!endDate) {
      return dateTimeFormatter.format(startDate);
    }

    const sameDay =
      startDate.getUTCFullYear() === endDate.getUTCFullYear() &&
      startDate.getUTCMonth() === endDate.getUTCMonth() &&
      startDate.getUTCDate() === endDate.getUTCDate();

    if (sameDay) {
      return `${dateFormatter.format(startDate)}\n${timeFormatter.format(
        startDate
      )} ~ ${timeFormatter.format(endDate)}`;
    }

    return `${dateTimeFormatter.format(startDate)} ~ ${dateTimeFormatter.format(
      endDate
    )}`;
  };

  const showTooltip = (event, info, options = {}) => {
    if (!tooltipContent) return;
    const { pin = false } = options;
    pinnedEventEl = pin ? info.el : null;
    const startDate = info.event.start;
    const endDate = info.event.end;

    tooltipContent.innerHTML = `
      <strong>${escapeCalendarHtml(tr(info.event.title))}</strong><br>
      <span>${buildEventPeriod(startDate, endDate)}</span>
    `;
    tooltip.style.display = "block";
    positionTooltip(event);
  };

  const hideTooltip = (force = false) => {
    if (!force && pinnedEventEl) {
      return;
    }
    tooltip.style.display = "none";
    pinnedEventEl = null;
  };

  try {
    // 저장해 둔 이벤트가 있으면 그걸로 바로 그리고, 없으면 (같이 시작해 둔) DB 읽기를 기다림
    const cachedEvents = readCalendarCache();
    let sanitizedEvents = cachedEvents;
    if (!sanitizedEvents) {
      sanitizedEvents = await calendarEventsPromise;
      writeCalendarCache(sanitizedEvents);
    }
    if (signal.aborted) return;
    const setEmptyMessage = (events) => {
      if (!emptyMessageEl) return;
      emptyMessageEl.textContent = t("표시할 이벤트가 없습니다.", "No events to show.");
      emptyMessageEl.hidden = events.length > 0;
    };

    const getIsMobile = () => window.matchMedia("(max-width: 768px)").matches;

    const buildToolbarConfig = () => ({
      left: "prev,next today",
      center: "customText",
      right: "currentMonth",
    });

    // 서버 시각 맞추기도 페이지 시작 때 같이 시작했으므로 보통 이미 끝나 있음 (늦으면 잠깐만 기다림)
    if (window.DSRTime) await window.DSRTime.readyWithin(300);
    const calendar = new calendarLib.Calendar(calendarHost, {
      plugins: calendarLib.plugins,
      locale: isEn() ? 'en' : calendarLib.locale,
      timeZone: "UTC", // 이벤트 시각을 한국 시간 벽시계로 넘기므로 그대로 표시
      now: () => kstWallOf(serverNow()), // "오늘"과 현재 시각 선은 서버 시각(한국 시간)
      initialView: getIsMobile() ? "listWeek" : "dayGridMonth",
      headerToolbar: buildToolbarConfig(),
      buttonText: {
        today: t("오늘", "Today"),
        month: t("월간", "Month"),
        week: t("주간", "Week"),
        list: t("목록", "List"),
      },
      customButtons: {
        customText: {
          text: t("이벤트 캘린더", "Event Calendar"),
        },
        currentMonth: {
          text: "",
        },
      },
      datesSet() {
        updateCurrentMonthLabel();
      },
      nowIndicator: true,
      navLinks: false,
      dayMaxEvents: false,
      displayEventTime: false,
      height: "auto",
      contentHeight: "auto",
      expandRows: true,
      events: sanitizedEvents,
      eventDidMount(info) {
        info.el.addEventListener("mouseenter", (evt) =>
          showTooltip(evt, info)
        );
        info.el.addEventListener("mousemove", positionTooltip);
        info.el.addEventListener("mouseleave", () => hideTooltip());
        info.el.addEventListener("click", (evt) => {
          if (pinnedEventEl === info.el && tooltip.style.display === "block") {
            hideTooltip(true);
            return;
          }
          showTooltip(evt, info, { pin: true });
        });
      },
    });

    const updateCurrentMonthLabel = () => {
      const currentMonthButton = calendarHost.querySelector(
        ".fc-currentMonth-button"
      );
      if (currentMonthButton) {
        currentMonthButton.textContent = calendar.view?.title ?? "";
      }
    };

    calendar.render();
    updateCurrentMonthLabel();

    const now = wallToDate(kstWallOf(serverNow()));
    const upcoming = sanitizedEvents
      .map((event) => {
        const start = wallToDate(event.start);
        const end = event.end ? wallToDate(event.end) : null;
        return { event, start, end };
      })
      .filter(({ start }) => {
        if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
          return false;
        }
        return start >= now;
      })
      .sort((a, b) => a.start - b.start)[0];

    if (upcoming && upcoming.start) {
      calendar.gotoDate(upcoming.start);
    } else {
      calendar.gotoDate(now);
    }
    updateCurrentMonthLabel();

    // 화면 폭이 768px 을 넘나들 때만 월간 ↔ 목록 보기를 바꿈.
    // (예전엔 창 크기가 1px 바뀔 때마다 위 도구 막대를 새로 그렸음. 도구 막대 설정은 늘 같아서 다시 넣을 필요 없음)
    const applyResponsiveOptions = () => {
      const targetView = getIsMobile() ? "listWeek" : "dayGridMonth";
      if (calendar.view?.type !== targetView) {
        calendar.changeView(targetView);
      }
      updateCurrentMonthLabel();
    };

    window.matchMedia("(max-width: 768px)").addEventListener("change", applyResponsiveOptions, { signal });
    document.addEventListener("click", (evt) => {
      if (!pinnedEventEl) {
        return;
      }
      if (!pinnedEventEl.contains(evt.target)) {
        hideTooltip(true);
      }
    }, { signal });

    setEmptyMessage(sanitizedEvents);

    const replaceEvents = (events) => {
      hideTooltip(true);
      calendar.removeAllEvents();
      calendar.addEventSource(events);
      setEmptyMessage(events);
      writeCalendarCache(events);
    };

    // 저장해 둔 이벤트로 먼저 그렸으면, 새로 받은 이벤트가 다를 때만 바꿔 끼움
    if (cachedEvents) {
      calendarEventsPromise.then((fresh) => {
        if (signal.aborted) return;
        if (JSON.stringify(fresh) !== JSON.stringify(cachedEvents)) replaceEvents(fresh);
      }).catch((error) => console.warn("이벤트를 새로 불러오지 못해 저장해 둔 것을 보여 줍니다:", error));
    }

    // 관리자 도구가 이벤트를 수정한 뒤 다시 불러올 때 사용
    window.DSRCalendar.reload = async () => {
      replaceEvents(await loadCalendarEvents());
    };
  } catch (error) {
    console.error("이벤트 캘린더 데이터를 불러오는 중 오류가 발생했습니다.", error);
    if (emptyMessageEl) {
      emptyMessageEl.textContent = t("캘린더 데이터를 불러오지 못했습니다.", "Could not load calendar data.");
      emptyMessageEl.hidden = false;
    }
  }
});
}
