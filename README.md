# Schoolboard (Campus Connect)

학교 구성원(재학생·졸업생·교직원)을 위한 캠퍼스 커뮤니티 웹 앱입니다.
커뮤니티 게시판, 행사, 중고장터, 1:1 채팅을 제공하며, 게시글·행사·장터 전반에 **익명 작성자 표시**가 적용됩니다.

> Figma Make 프로토타입(01_Odd-School v3)에서 출발해 Supabase 백엔드 연동, 익명 시스템, 채팅, Google Maps 행사 위치 등을 추가한 프로젝트입니다.

## 주요 기능

- **이메일 코드 인증 가입** — 가입 시 이메일로 6자리 코드를 보내 소유를 확인합니다. 학교 도메인(`.edu`, `.ac.kr` 등)은 자동 승인, 그 외 도메인은 관리자가 Admin 페이지에서 승인/거절하는 혼합 방식입니다.
- **커뮤니티 게시판** — 카테고리(재학생/졸업생/전체) 필터, 좋아요, 댓글, 게시글 수정 이력(`post_history`) 보관.
- **익명 시스템** — 사용자 ID를 해시해 "Happy Panda" 같은 결정적 익명 이름·아바타 색상을 생성(`src/utils/anonymousName.ts`). 관리자는 별도 RPC로 실명을 확인할 수 있습니다.
- **행사** — 캘린더 뷰, RSVP, 좋아요/댓글, Google Maps 기반 위치(자동완성·좌표·반경).
- **중고장터** — 다중 이미지 갤러리, 찜(저장), 조회수, 댓글, 판매자와 1:1 채팅 연결.
- **메시지** — 대화방 기반 1:1 채팅.
- **관리자 대시보드** — 가입 승인/거절, 통계, 콘텐츠 관리.

## 기술 스택

- **Frontend**: React 18 + TypeScript, Vite 6, Tailwind CSS v4
- **UI**: shadcn/ui (Radix UI), lucide-react, sonner
- **Backend**: Supabase (Auth + Postgres + Row Level Security) — 별도 서버 없이 클라이언트에서 직접 호출
- **지도**: Google Maps JavaScript API
- **라우팅**: 해시 기반 수동 라우팅 (`src/App.tsx`)

## 시작하기

### 1. 의존성 설치

```bash
npm i
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채웁니다.

```
VITE_SUPABASE_URL=        # Supabase 프로젝트 URL
VITE_SUPABASE_ANON_KEY=   # Supabase anon key
VITE_GOOGLE_MAPS_API_KEY= # Google Maps API key (행사 위치 기능)
```

### 3. 데이터베이스 스키마

Supabase Dashboard → SQL Editor에서 `public/` 폴더의 SQL을 실행합니다.

- `public/marketplace-schema.sql` — 중고장터 테이블(`marketplace_items`, `marketplace_saves` 등)과 RLS 정책
- `public/post-history-schema.sql` — 게시글 수정 이력(`post_history`) 테이블과 RLS 정책
- `public/school-email-schema.sql` — 학교 도메인 자동 승인 함수(`is_school_email`)와 `profiles` BEFORE INSERT 트리거

이 외의 기본 테이블(`profiles`, `posts`, `post_likes`, `post_comments`, `events`, `event_likes`, `event_comments`, `event_rsvps`, `conversations`, `conversation_participants`, `messages`, `marketplace_comments`)과 RPC(`get_email_by_username`, `increment_marketplace_views`), `avatars` 스토리지 버킷은 Supabase 프로젝트에 미리 구성되어 있어야 합니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

프로덕션 빌드는 `npm run build`.

## 프로젝트 구조

```
src/
├── App.tsx                  # 해시 라우터 + 인증 상태별 리다이렉트
├── CommunityPage.tsx        # 커뮤니티 게시판
├── EventsPage.tsx           # 행사 (캘린더 뷰)
├── MarketplacePage.tsx      # 중고장터
├── ProfilePage.tsx          # 프로필
├── AdminPage.tsx            # 관리자 대시보드
├── EditProfilePage.tsx      # 프로필 수정
├── LoginPage.tsx / RegisterPage.tsx
├── ForgotPasswordPage.tsx / ResetPasswordPage.tsx
├── VerificationPendingPage.tsx  # 승인 대기/거절 안내
├── utils/
│   ├── authContext.tsx      # Supabase Auth 세션 + profiles 연동
│   ├── dataContext.tsx      # 게시글·행사·장터 CRUD
│   ├── chatContext.tsx      # 1:1 채팅
│   ├── anonymousName.ts     # 익명 이름·아바타 색상 생성
│   ├── supabaseClient.ts    # Supabase 클라이언트
│   └── useGoogleMaps.ts     # Google Maps 로더
└── components/
    ├── NavigationBar.tsx, PostCard.tsx, EventCard.tsx, ...
    ├── Chat*.tsx            # 채팅 UI
    └── ui/                  # shadcn/ui 컴포넌트
```

## 인증 흐름

1. 가입 → Supabase가 이메일로 6자리 인증 코드 발송 → `#/verify-email`에서 코드 입력
2. 학교 도메인(`.edu`, `.edu.*`, `.ac.*`) 이메일이면 코드 인증 즉시 `approved` — 바로 이용 가능
3. 그 외 도메인은 `pending`으로 생성되어 관리자가 Admin 페이지에서 승인/거절
4. 승인된 사용자만 메인 페이지 접근 가능 (라우터가 상태별로 강제 리다이렉트)
5. 비밀번호 재설정은 Supabase recovery 링크(`#type=recovery`)로 처리

> Supabase 대시보드에서 "Confirm email" 활성화와 Confirm signup 템플릿(`{{ .Token }}`) 설정이 필요합니다.
> 자세한 단계는 `public/school-email-schema.sql` 상단 주석 참고. 실서비스에서는 커스텀 SMTP 연결 필수.

## 라이선스 및 출처

UI 컴포넌트·이미지 출처는 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)를 참고하세요.
