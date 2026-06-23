# 旅 Tabi · 일본 여행 도우미

영수증 가계부 · 자연어 일정표 · 길찾기/대중교통 · 사진 번역 · LLM 비서 를 한 앱에.
**Next.js 14 + Supabase + Vercel + Anthropic + Google Maps**

## 기능
| 탭 | 설명 |
|---|---|
| 홈 | 총 지출·다가오는 일정 요약, 빠른 실행 |
| 일정 | 자연어로 말하면 AI가 동선까지 짜줌. 노선도 타임라인. 항목 수정/추가/삭제 |
| 가계부 | 영수증 사진 → 가게·품목·금액 자동 추출 → 수정 후 저장 |
| 길찾기 | 구글맵 경로 + 어떤 전철/버스 타는지 단계별 안내 (대중교통/도보/자동차) |
| 번역 | 사진 속 일본어를 읽어 말풍선으로 번역 + 설명 |
| 비서 | 여행 중 뭐든 물어보는 LLM 채팅 (기록 저장) |

모든 데이터는 수정 가능합니다.

---

## 1. 준비물 (API 키 3종)

### Supabase
1. https://supabase.com 새 프로젝트 생성
2. **SQL Editor** 에서 `supabase/schema.sql` 전체를 붙여넣고 RUN
3. **Settings → API** 에서 `Project URL`, `anon public` 키 복사

### Anthropic (LLM)
- https://console.anthropic.com 에서 API 키 발급 (`sk-ant-...`)

### Google Maps
- https://console.cloud.google.com → 프로젝트 생성
- **API 라이브러리**에서 활성화: `Maps JavaScript API`, `Directions API`, `Places API`
- **사용자 인증 정보 → API 키** 생성
  - 브라우저용 키: HTTP 리퍼러 제한(배포 도메인) 권장 → `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - (선택) 서버용 키: `GOOGLE_MAPS_SERVER_KEY` — `/api/directions` 프록시를 쓸 때만 필요. 지도 페이지는 브라우저 키로 동작.

## 2. 로컬 실행
```bash
cp .env.example .env.local   # 값 채우기
npm install
npm run dev                  # http://localhost:3000
```

## 3. Vercel 배포
1. GitHub 에 푸시
2. https://vercel.com → New Project → 저장소 선택
3. **Environment Variables** 에 `.env.local` 의 값들을 그대로 등록
   (`NEXT_PUBLIC_*` 포함 전부)
4. Deploy. 끝.

> 배포 후 도메인을 Google Maps 브라우저 키의 리퍼러 제한과 Supabase Storage 설정에 반영하세요.

---

## 보안 메모
- 지금은 **개인용 단일 사용자** 가정이라 Supabase RLS 가 꺼져 있어 anon 키로 누구나 읽기/쓰기 가능합니다.
- 공개 배포하거나 여러 명이 쓸 거면 **Supabase Auth** 를 켜고, 각 테이블에 `user_id` 컬럼 + RLS 정책(`auth.uid() = user_id`)을 추가하세요.
- `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_SERVER_KEY` 는 `NEXT_PUBLIC_` 이 아니므로 브라우저에 노출되지 않습니다 (서버 라우트에서만 사용).

## 모델 변경
`.env` 의 `ANTHROPIC_MODEL` 로 교체 (기본 `claude-sonnet-4-6`). 비용을 줄이려면 더 가벼운 모델, 정확도를 높이려면 상위 모델로.

## 구조
```
app/
  page.tsx              홈
  itinerary/page.tsx    일정
  expenses/page.tsx     가계부
  map/page.tsx          길찾기
  translate/page.tsx    번역
  assistant/page.tsx    비서
  api/
    receipt/            영수증 분석
    itinerary/          일정 생성
    translate/          사진 번역
    chat/               비서
    directions/         (선택) 서버 길찾기 프록시
lib/      supabase, anthropic, image, gmaps, types
components/ Nav, ui
supabase/schema.sql
```
