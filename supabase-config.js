/* ───────────────────────────────────────────────
   Veil — Supabase 설정
   여기에 본인 프로젝트의 값 2개를 넣으면 "클라우드 동기화"가 켜집니다.
   값이 비어 있으면 지금처럼 기기-로컬 모드로 동작합니다(아무것도 깨지지 않음).

   ⚠ anon(공개) 키는 클라이언트에 노출돼도 안전한 키입니다(데이터는 RLS로 보호).
      service_role 키는 절대 여기에 넣지 마세요.

   설정 방법은 SUPABASE_SETUP.md 참고:
     1) supabase.com 가입 → New project 생성
     2) SQL Editor에 SUPABASE_SETUP.md의 SQL 붙여넣고 Run
     3) Project Settings → API 에서 Project URL 과 anon public key 복사
     4) 아래 url / anonKey 에 붙여넣고 저장(푸시하면 자동 배포)
   ─────────────────────────────────────────────── */
window.VEIL_SUPABASE = {
  url: 'https://qfkiqjpzeygoypqkwvwz.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2lxanB6ZXlnb3lwcWt3dnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODQyMzgsImV4cCI6MjA5NTY2MDIzOH0.GsF0REih2yvxNrQKnYucWm2tTeXMyABijh9qKbaXcoU',
};
