// 메인 페이지 — 기능별 파일(src/scripts/home/)을 모아서 넘김
// 예전엔 app/index.js · app/calendar.js · app/raid-timer.js 를 한 파일에 이어 붙여 두었음.
// 순서가 곧 실행 순서: 서버 시각이 먼저, onReady 는 쿠폰 → 오늘의 장소·환율 → 캘린더 → 레이드 타이머
import { init as time } from './home/time.js';
import { init as supabase } from './home/supabase.js';
import { init as coupons } from './home/coupons.js';
import { init as today } from './home/today.js';
import { init as calendar } from './home/calendar.js';
import { init as raidTimer } from './home/raid-timer.js';

export const inits = [time, supabase, coupons, today, calendar, raidTimer];
