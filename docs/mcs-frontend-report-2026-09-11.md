# fixup-image-agent(MCS) 프론트 조사 보고서

- 조사일: 2026-09-10
- 대상 저장소: `C:\Users\fixup\fixup-image-agent` — `https://github.com/junginsu-make/fixup-image-agent.git`
  clone 성공(공개 저장소). HEAD `962d107` (`Merge pull request #82 from junginsu-make/feat/model-aliases`)
- 우리 저장소: `C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate` — **읽기만 했다. 한 글자도 고치지 않았다.**
- 제품명: **MCS (Marketing Content Studio)**. 카드뉴스·이미지(포스터/광고)·상세페이지·리디자인·캐릭터를 한 앱에서 만든다.

> ## ★ 가장 먼저 알아야 할 것 — **이미 같은 뿌리다**
>
> MCS 의 색 토큰과 우리 `app/globals.css` 의 색 토큰은 **값이 거의 같다.**
> `#F5F4ED` · `#FAF9F5` · `#141413` · `#5E5D59` · `#E8E6DC` · `#B0446A` 가 양쪽에 그대로 있다.
> 우리 `tests/design-system.test.js` 머리말이 가리키는 스펙 이름이 `2026-09-08-light-theme-**mcs**-design.md`
> 이고, 우리 `.display` 규칙 주석에 "**근거: MCS 실측**"이라고 적혀 있다.
> 즉 **색은 이미 옮겨져 있다.** 이번에 옮길 것이 남아 있는 자리는 색이 아니라
> **① 사다리(글자 크기·굵기·모서리) ② 레이아웃 골격 ③ 부품 어휘 ④ 법률 문서**다.
>
> MCS 의 원류는 운영자 저장소 `junginsu-make/open-design` 의 `design-systems/claude/DESIGN.md`
> (warm-editorial / Parchment·Ivory·Near Black)다 —
> `docs/superpowers/specs/2026-07-21-ui-overhaul-design.md` §2 에 근거가 적혀 있다.
> 원래 강조색은 Terracotta `#c96442` 였고, 2026-07-22 에 운영자 결정으로 자미·플럼 `#B0446A` 가 됐다.

---

## 1. MCS 디자인 언어 요약

### 1-1. 한눈에

| 항목 | 값 | 자리 |
|---|---|---|
| 프레임워크 | **Next.js 15.5.24 App Router** · React 18.3.1 · TypeScript · pnpm 모노레포 | `apps/web/package.json` |
| CSS 방식 | **Tailwind CSS v4.3.1 (CSS-first)** — `@import "tailwindcss"` + `@theme inline`. `tailwind.config.*` 파일 **없음** | `apps/web/app/globals.css`(4줄), `apps/web/postcss.config.mjs` |
| UI 라이브러리 | **shadcn/ui 정본**(Radix + cva + tailwind-merge) 을 사내 패키지로 복사 | `packages/ui/src/components/ui/*` |
| 토큰 정의 | **한 파일**. 312줄 | `packages/ui/src/styles/globals.css` |
| 서체 | **Pretendard Variable** — 자체 서버에서 `@font-face` 92장(subset woff2) | `apps/web/app/pretendard.css`(963줄), `public/fonts/pretendard/*` |
| 밝은/어두운 | **밝은 벌이 기본, 어두운 벌 있음.** `next-themes`(`attribute="class"`, `defaultTheme="system"`) → OS 를 따라간다. 토글 버튼이 상단에 상시 노출 | `packages/ui/src/components/theme-provider.tsx`, `theme-toggle.tsx` |
| 앱 껍데기 | **좌측 고정 사이드바** `clamp(236px, 15vw, 300px)` + 좁은 화면 전용 상단바(`lg:hidden`) | `packages/ui/src/components/app-shell.tsx` |
| 본문 기둥 | **max-width 없음.** 좌우 여백만 `clamp(16px, 2.2vw, 52px)` | 같은 파일 `<main>` |
| 단계 표시 | **본문 맨 위 가로 StepBar**(`<ol>`) | `packages/ui/src/components/step-bar.tsx` |
| 그림자 | `--shadow-ring: 0 0 0 1px var(--border)` 가 기본. 떠야 할 것만 `--shadow-elevate: 0 4px 24px rgba(0,0,0,.05)` | 토큰 파일 |
| 그라디언트 | 설계상 금지. 실제로는 앱층에 `bg-gradient-to-br` 2건 + CSS `linear-gradient` 12건 · `radial-gradient` 1건이 남아 있다 | — |
| 아이콘 | `lucide-react` (SVG 컴포넌트). 유니코드 글리프를 쓰지 않는다 | 전 화면 |

### 1-2. 색 토큰 (밝은 벌 · `:root`)

```
표면   --background #f5f4ed   --card #faf9f5   --popover #faf9f5
       --muted #efeee7        --canvas #ffffff (다크에서도 밝게 유지)
글자   --foreground #141413   --muted-foreground #5e5d59   --subtle-foreground #87867f
선     --border #e8e6dc       --border-soft #f0eee6        --input #e8e6dc
강조   --primary #B0446A      --primary-foreground #ffffff
       --primary-soft rgba(176,68,106,.10)   --primary-ring rgba(176,68,106,.35)
       --secondary #efeee7    --accent #eceae0   --ring #B0446A
상태   --destructive #b0453c  --success #2f7d5f  --warning #b07d2a
반경   --radius 14px          고도 --shadow-ring / --shadow-elevate
```

어두운 벌(`.dark`)은 같은 이름을 전부 다시 정의한다 —
`--background #1c1b19` · `--card #26251f` · `--foreground #eceae2` · `--primary #C96A8A` 등.

### 1-3. 글자 사다리 (앱층)

`@theme inline` 이 정의한 것 — 각각 size·line-height·weight·letter-spacing 을 함께 묶는다.

| 이름 | 크기 | 굵기 | 자간 | 쓰임(실측) |
|---|---|---|---|---|
| `text-display` | 30px / 1.25 | 800 | −0.02em | 4회 |
| `text-h1` | 22px / 1.35 | 800 | −0.02em | 15회 |
| `text-h2` | 17px / 1.4 | 800 | — | 15회 |
| `text-h3` | 14px / 1.45 | 800 | — | 7회 |
| `text-body` | 14px / 1.6 | — | — | 12회 |
| `text-sm` | **13px** / 1.55 (Tailwind 기본 14px 를 덮어씀) | — | — | **422회** |
| `text-xs` | 12px / 1.5 | — | — | 205회 |
| `text-meta` | **11px** / 1.45 | 700 | +0.04em | 127회 |

여기에 **Tailwind 기본 사다리가 그대로 살아 있고**(`text-base` 16 · `text-lg` 18 · `text-xl` 20 ·
`text-2xl` 24 · `text-3xl` 30 · `text-5xl` 48), 임의값도 쓴다(`text-[15px]` 1 · `text-[11px]` 43 ·
`text-[10px]` 7 · `text-[9px]` 2).

→ **앱층 고유 크기 15가지: 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 · 17 · 18 · 20 · 22 · 24 · 30 · 48px**

굵기: `font-normal`(400) 2 · `font-medium`(500) 43 · `font-semibold`(600) 29 ·
`font-bold`(700) 128 · `font-extrabold`(800) 26 · `font-black`(900) 5 → **여섯 단계**

### 1-4. 간격·모서리 사다리

- **간격**: Tailwind 기본(4px 기준) 그대로. `--spacing` 재정의 없음.
  반칸(`gap-0.5`=2px · `gap-1.5`=6px · `p-2.5`=10px · `p-3.5`=14px)을 자주 쓴다.
  실제 빈도 상위: `gap-2`(264) · `gap-3`(124) · `gap-1.5`(102) · `gap-4`(82) · `p-3`(53) · `p-4`(51)
- **모서리**: `--radius-sm 8` · `--radius-md 12` · `--radius-lg 14(=--radius)` · `--radius-xl 24`.
  Tailwind 기본도 남아 `rounded`=4px · `rounded-2xl`=16px · `rounded-full`=9999px 가 함께 쓰인다.
  빈도: `rounded-md`(209) · `rounded-lg`(98) · `rounded-full`(66) · `rounded`(27) · `rounded-xl`(20) · `rounded-sm`(9) · `rounded-2xl`(3)
  → **앱층 고유 반경 7가지: 4 · 8 · 12 · 14 · 16 · 24 · 9999px**

### 1-5. 핵심 부품 (실제 클래스)

전부 shadcn 정본이라 우리가 직접 클래스를 읽을 수 있다.

| 부품 | 클래스 (요약) | 치수 |
|---|---|---|
| 버튼 공통 | `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 [&_svg]:size-4` | 반경 12px · 글자 13px |
| 버튼 주(`default`) | `bg-primary text-primary-foreground shadow hover:bg-primary/90` | 높이 **36px**(`h-9 px-4 py-2`) |
| 버튼 보조(`outline`) | `border border-input bg-background shadow-sm hover:bg-accent` | 같은 높이 |
| 버튼 그 외 | `secondary` · `ghost` · `link` · `destructive` | `sm` 32px(text-xs) · `lg` 40px(px-8) · `icon` 36×36 |
| 입력칸 | `flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring` | **높이 36px** · 바탕 투명 |
| 텍스트영역 | `min-h-[60px] … rounded-md border border-input bg-transparent px-3 py-2 text-sm` | 최소 60px |
| 카드 | `rounded-xl border bg-card text-card-foreground shadow` (`CardHeader/Content/Footer` 는 `p-6`) | **반경 24px · 여백 24px** |
| 배지 | `rounded-md border px-2.5 py-0.5 text-xs font-semibold` + variant `green`=`bg-primary-soft text-primary` | 반경 12px |
| 탭 | 목록 `inline-flex h-9 rounded-lg bg-muted p-1` · 탭 `rounded-md px-3 py-1 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow` | 높이 36px |
| 모달 | 덮개 `fixed inset-0 z-50 bg-black/80` · 내용 `fixed left-[50%] top-[50%] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg` | **폭 512px · 여백 24px** |
| 패널(서랍) | `packages/ui/src/components/ui/side-panel.tsx` + `@keyframes fixup-panel-in 220ms cubic-bezier(.32,.72,0,1)` | 오른쪽에서 밀려 나옴 |
| 링(기본 고도) | `shadow-[var(--shadow-ring)]` — 실측 **53회**로 가장 많이 쓰이는 그림자 | 1px 링 |

애니메이션은 토큰 파일 하단에 네 개만 있다 — `pdp-indeterminate`(진행률 모르는 대기 막대) ·
`fixup-panel-in` · `fixup-attention`(다 됐다고 여섯 번만 뛰는 손잡이) ·
`fixup-working`(끝날 때까지 흐르는 띠). 넷 다 `prefers-reduced-motion` 에서 꺼진다.

### 1-6. 앱 껍데기·화면 골격

```
┌─ (좁은 화면만) 상단바 h-14 sticky ────────────────────────┐
├─ aside  sticky h-screen  bg-card  border-r ──┬─ 본문 ────┤
│  로고(BrandMark 32px + "MCS" 15px 700        │  우측 상단 │
│       + "MARKETING CONTENT STUDIO" 9px/.2em) │  계정·테마 │
│  ── 설명서 (강조: 점선 테두리) ──            │  ── 본문 ─ │
│  ── 도구 (카드뉴스·이미지·상세·리디자인·캐릭터)│  eyebrow  │
│  ── 보관 (라이브러리)                        │  h1        │
│  프로젝트 고르기 (전체 + 목록)               │  설명       │
│  ── mt-auto: 만드는 중 · 계정 · 팀 · 관리자 ─ │  grid gap-8│
└──────────────────────────────────────────────┴───────────┘
```

- 사이드바 폭은 CSS 변수로 셸이 쥔다: `lg:grid-cols-[var(--shell-side)_minmax(0,1fr)] [--shell-side:clamp(236px,15vw,300px)]`
- 선택 표시는 **채운 바탕**(`bg-primary-soft` + `shadow-[0_0_0_1px_var(--primary-ring)]`),
  강조 표시는 **테두리만**(`border-dashed border-primary/40`). 둘을 일부러 다르게 뒀다.
- 화면 전환은 **평범한 라우팅**이다(`next/link`). 단계는 URL 이 아니라 화면 안 StepBar 로 오간다.
- 화면 머리 관용구: `text-meta` 눈썹(예: `IMAGE`) → `text-h1` 제목 → `text-body text-muted-foreground` 설명 → `grid gap-8` 섹션들.
- `<main>` 은 셸이 하나만 연다(페이지가 또 열지 않는다).

### 1-7. 회원가입·로그인 화면

**우리와 구조가 다르다 — 탭이 아니라 화면이 넷이다.**

| 화면 | 파일 | 줄 수 |
|---|---|---|
| 로그인 | `apps/web/app/login/page.tsx` | 71 |
| 회원가입 | `apps/web/app/signup/page.tsx` | 136 |
| 비밀번호 찾기 | `apps/web/app/forgot-password/page.tsx` | 58 |
| 비밀번호 재설정 | `apps/web/app/reset-password/page.tsx` | 38 |
| 공통 껍데기 | `apps/web/app/_components/auth-shell.tsx` | 48 |
| 공개 헤더/푸터/단계 | `apps/web/app/_components/public-shell.tsx` | 147 |

`AuthShell` 구성 — **두 기둥**:

```
bg-muted/25 · min-h-screen
 └ PublicHeader (sticky h-16, max-w-6xl, 로고 + [로그인][가입 신청])
 └ main  mx-auto max-w-5xl  lg:grid-cols-[0.9fr_1.1fr]  content-center gap-8
    ├ (넓은 화면만) 왼쪽 홍보 기둥
    │   "AI 콘텐츠 스튜디오"  text-sm font-extrabold text-primary
    │   h1  text-3xl(30px) font-black tracking-tight  2줄
    │   설명 leading-7 text-muted-foreground
    │   rounded-2xl border bg-background p-6  →  OnboardingSteps
    └ 오른쪽 max-w-md
        (좁은 화면만) rounded-xl border p-4 → OnboardingSteps
        Card ─ CardHeader(CardTitle/CardDescription) ─ CardContent → 폼
        "회원가입 전 결과물 보기" → /demo
```

`OnboardingSteps` = **가입 신청 → 이메일 인증 → 스튜디오 이용** 3단.
동그라미 32px(`h-8 w-8 rounded-full`), 지난 단계는 `<Check/>`, 연결선은 `h-px` 절대배치.
로그인은 `step={3}`, 가입은 `step={message ? 2 : 1}`.

폼 구성:

- **로그인**: 이메일 / 비밀번호 → `Turnstile` 캡차 → `Button w-full`("로그인" / "로그인 중...")
  → 아래 한 줄 `flex justify-between`: 「비밀번호 찾기」(muted) · 「회원가입」(`font-bold text-primary`)
- **가입**: 이메일 / 비밀번호 / **비밀번호 확인** → 캡차 → 「인증 메일 받기」
  → "이미 계정이 있나요? 로그인"
  - 8자 미만·불일치·캡차 미완은 화면에서 먼저 막는다
  - 성공하면 폼이 사라지고 **`bg-primary-soft p-4` 안내 상자**로 바뀐다:
    "메일함을 확인해 주세요" + 주소 + 「인증을 마쳤어요 · 로그인」 버튼
  - 메일 발송 실패(하루 500통 한도)는 **별도 Dialog** 로 가른다:
    "오늘은 가입 신청을 더 받을 수 없습니다 … 내일 다시 시도해 주세요"
- 오류는 `<p role="alert" className="text-sm text-destructive">`

우리와의 차이 — MCS 는 **관리자 승인이 없다**(이메일 인증만 마치면 바로 이용).
우리는 승인제(`/pending`)라 문구를 그대로 못 쓴다.

### 1-8. 랜딩(메인) — **참고용. 우리는 안 바꾼다**

`apps/web/app/page.tsx` → 루트가 `<div className="mcs mcs-dark">` — **검은 바탕**이다.

| 순서 | 무엇 |
|---|---|
| 헤더 | `position: fixed`, 히어로 위에 얹힘. 로고 + 메뉴 4개(`/about`·`#claim`·`#try`·`#diff`) + 언어 전환(`?lang=` 링크) + [로그인][가입 신청] |
| ① 히어로 | `100svh` **raw WebGL1 캐러셀**. 글자 없음. 드래그 관성 + 휠 가로채기 |
| ② KeyMessage | "01 디자이너~~가 아니여도 / 02 마케터~~가 아니여도" — 직업명에 취소선 |
| ③ ClaimStrip | "레퍼런스 한 장이면, 같은 결의 그림이 나옵니다" + before/after 슬라이더 3쌍 |
| ④ TrySection | 직접 해보기 — 프리셋 탭 → 프롬프트 → 가짜 실행 로그 4단계 → 결과 |
| ⑤ Difference | 4열 비교 표 (항목 / A / B / MCS) |
| ⑥ 푸터 | MCS + 안내문 + `/about` + **약관·처리방침 모달 링크** + 저작권 |

히어로 기술: `canvas.getContext("webgl")` 에 원통 굽음(`pos.z += curve*0.34`) + 사인파 2겹.
물리 상수는 별도 모듈에 있다(`drag-physics.ts` `FRICTION_PER_SECOND 0.045` · `MAX_VELOCITY 26`,
`arc-layout.ts` `RADIUS 11.5` · `VISIBLE_ANGLE 1.15`). WebGL 없으면 가로 스크롤 `<img>` 폴백.

**★ 랜딩은 앱과 다른 디자인 시스템이다.** `_landing/` 안에는 Tailwind 유틸도 `@fixup/ui` import 도
**0건**이고, `--mcs-*` 라는 자체 토큰 27개(하드코딩 hex)를 쓴다. `hero.css` 가 `.mcs.mcs-dark` 에서
같은 이름을 어두운 값으로 **덮어써** 섹션 전체를 한 번에 뒤집는다.
글자는 clamp 13종 + px 21종(`13.5` `14.5` `11.5` 처럼 0.5px 단위가 8개), 반경 9종(`999px` 이 43%),
그림자 8건, 그라디언트 **1건**(헤더 아래 그늘).

> 이 구조는 **우리와 판박이다** — 우리도 `.home` 아래에서만 `--stage-*`(7개)를 쓰고
> `main.work--flush` 로 기둥을 걷는다. 즉 "앱은 밝은 한 벌, 랜딩만 어두운 별세계"라는
> 결정이 양쪽에서 같다.

---

## 2. 우리와 다른 점 — 나란히

### 2-1. 기술 스택

| | MCS | shotform (step-gate) |
|---|---|---|
| 프레임워크 | Next.js 15.5.24 App Router · **TypeScript** | Next.js ^15.3 App Router · **순수 JS** |
| React | 18.3.1 | ^19 |
| 저장소 | pnpm 모노레포(`apps/web` + `packages/*` 8개) | 단일 앱 |
| CSS | **Tailwind v4 + shadcn/ui** | **손으로 쓴 전역 CSS 한 장** (`app/globals.css` 2903줄) |
| 부품 | Radix + cva 컴포넌트 20종 | 클래스 어휘(`.cta` `.mini` `.panel` `.sent-input` …) |
| 아이콘 | `lucide-react` | 인라인 SVG(유니코드 글리프 금지가 판으로 걸려 있음) |
| 판정 | eslint + tsc + vitest | **vitest 만** (린터·타입체커 없음) |

### 2-2. 색

| 역할 | MCS | shotform | 판정 |
|---|---|---|---|
| 페이지 바탕 | `--background #f5f4ed` | `--bg #F5F4ED` | **같음** |
| 카드 | `--card #faf9f5` | `--surface2 #FAF9F5` | **같음** |
| 흰 면 | `--canvas #ffffff` | `--surface #FFFFFF` | **같음** |
| 가라앉은 면 | `--muted #efeee7` | `--deep #EFEDE4` | **다름(EE7 ↔ EE4)** |
| 본문 글자 | `--foreground #141413` | `--ink #141413` | **같음** |
| 보조 글자 | `--muted-foreground #5e5d59` | `--ink-soft #5E5D59` | **같음** |
| 메타 글자 | `--subtle-foreground #87867f` | *(없음)* | **우리에 없는 3번째 톤** |
| 선 | `--border #e8e6dc` | `--line #E8E6DC` | **같음** |
| 옅은 선 | `--border-soft #f0eee6` | *(없음)* | 없음 |
| 강조 | `--primary #B0446A` | `--accent` / `--btn #B0446A` | **같음** |
| 강조 옅게 | `--primary-soft rgba(176,68,106,.10)` | `--accent-soft rgba(176,68,106,0.10)` | **같음** |
| 강조 링 | `--primary-ring rgba(176,68,106,.35)` | *(없음)* | 없음 |
| 성공 | `--success #2f7d5f` | `--good #0E7C57` | **다름** |
| 경고 | `--warning #b07d2a` | `--warn #9A6400` | **다름** |
| 실패 | `--destructive #b0453c` | *(없음 — `.warn` 이 겸함)* | 없음 |
| 어두운 벌 | `.dark` 블록에 20여 개 재정의 | **없음(한 벌)** | **구조가 다름** |
| 랜딩 어두운 면 | `--mcs-*` 27개 | `--stage-*` 7개 | 같은 발상, 다른 이름 |

### 2-3. 서체

| | MCS | shotform |
|---|---|---|
| 글꼴 | Pretendard Variable | Pretendard Variable(같음) |
| 싣는 법 | **`@font-face` 92장** 손으로 쓴 CSS + `public/fonts/pretendard/` 92 woff2 | **`next/font/local`** 단일 `PretendardVariable.woff2` |
| 굵기 범위 | `45 920` (92장 전부) | `400 900` |
| 부르는 이름 | `--font-sans: "Pretendard Variable", "Pretendard", …` | `var(--font-pretendard)` (★ 이름을 "Pretendard" 로 줄이면 자막 OTF 와 충돌) |
| 지키는 판 | `app/__tests__/webfont.test.ts` — 92장·`swap`·`unicode-range`·CDN 금지를 낱장으로 셈 | `tests/design-system.test.js` — `next/font/local` 사용·`--font-pretendard` 사용·라틴 서체 재도입 금지·굵기 범위 ≥ CSS 최대굵기 |

### 2-4. 사다리 (★ 여기가 진짜 차이다)

| | MCS 앱층 | shotform 앱층 |
|---|---|---|
| **글자 크기** | 15가지 — 9·10·11·**12**·13·**14**·15·**16**·17·**18**·20·22·24·**30**·48 | **5가지 — 12·14·16·18·30** (판이 강제) |
| 실제 분포 | `text-sm`(13px) 422회 · `text-xs`(12) 205 · `text-meta`(11) 127 | 12px 67회 · 14px 42 · 16px 19 · 18px 5 · 30px 2 |
| **굵기** | 6단 — 400·**500**·600·**700**·**800**·**900** | **3단 — 400·600·700** (`.display` 만 900) |
| **모서리** | 7가지 — 4·8·12·**14**·**16**·24·9999 | **3가지 — 8(`--r-ctl`)·16(`--r-card`)·999(`--r-pill`)** + `50%` |
| 실제 분포 | `rounded-md`(12px) 209 · `rounded-lg`(14px) 98 · `rounded-full` 66 | `--r-ctl` 37 · `--r-card` 25 · `--r-pill` 14 · `50%` 12 |
| **간격** | Tailwind 4px 기준 + 반칸(2·6·10·14px) | `--sp-1..5` = 4·8·12·16·24 (**카드 층위만**) + 실측값(7px·5px 등) |
| **그림자** | 8종 이상. `shadow-[var(--shadow-ring)]` 53회 · `shadow` 45 · `shadow-sm` 12 | **총 8건**. 전부 `inset … 1px` 링 또는 3px 고리 |
| **그라디언트** | 앱층 15건 남아 있음 | **0건 (판이 금지)** |
| 전시층 제목 | 랜딩 `clamp(36px,5.4vw,68px)`, 슬로건 `clamp(40px,8vw,118px)` | `.display` `clamp(38px,6vw,62px)` 900 |

### 2-5. 레이아웃

| | MCS | shotform |
|---|---|---|
| 상단 띠 | 없음(좁은 화면만 `h-14` 상단바) | **`.belt` 42px sticky** — BETA 안내 + `UserMenu` |
| 사이드바 | `clamp(236px,15vw,300px)` · `bg-card` · `border-r` · sticky h-screen | `aside.side` **230px 고정** · `--surface` · `border-right` |
| 사이드바 내용 | 도구 메뉴(그룹 3) + 프로젝트 고르기 + 계정/팀/관리자 | **단계 스테퍼**(`.side-step`) + 메뉴 |
| 본문 기둥 | **max-width 없음** · 여백 `clamp(16px,2.2vw,52px)` | `main.work` **max-width 1160px · `margin-inline:auto`** · 여백 `24px 28px 40px` |
| 단계 표시 | **본문 맨 위 가로 StepBar**(`<ol> rounded-lg bg-card p-2.5 shadow-ring`) | **사이드바 세로 스테퍼** |
| 진행 중 표시 색 | `bg-primary` 채운 원 + `bg-primary-soft` 바탕 | `.side-step.on` 이 **`--accent` 를 쓰는 유일한 자리**(판이 강제) |
| 계정 자리 | 본문 우측 상단(`hidden lg:flex justify-end`) | 상단 벨트 우측 |
| 로그인 화면 폭 | `max-w-5xl` 두 기둥 + 카드 `max-w-md`(448px) | `.login-card` **420px** 한 기둥 · `.work--bare` 로 세로 가운데 |
| 랜딩 폭 | `--mcs-max: 1600px` · 여백 `clamp(20px,4vw,56px)` | `--stage-col: 1400px` · `--stage-gap: clamp(20px,4vw,56px)` (**여백 값이 글자 그대로 같다**) |

### 2-6. 로그인·가입 흐름

| | MCS | shotform |
|---|---|---|
| 라우트 | `/login` `/signup` `/forgot-password` `/reset-password` **4개** | `/login` **1개** |
| 전환 | **화면 이동** | **탭**(`.login-tabs` — `로그인`/`회원가입`, 밑줄 2px) |
| 입력칸 | 이메일·비밀번호(·확인) · 높이 36px · `bg-transparent` | 이메일·비밀번호(·**이름 필수**) · `.sent-input--lg` **높이 52px** · 바탕 `--deep` |
| 주 버튼 | `Button w-full` 높이 36px | `.cta--block` **높이 48px** |
| 캡차 | **Cloudflare Turnstile** | 없음 |
| 승인 | **없음**(이메일 인증만) | **운영자 승인제**(`/pending`) |
| 안내 단계 | `OnboardingSteps` 3단 + 홍보 기둥 | 부제 한 줄 |
| 비밀번호 찾기 | 화면 있음 | **없음** — "운영자에게 문의" 문장 |
| 보조 문 | `/demo` 결과물 보기 | `/home` 메인 · `/archive` 보관함 |
| 브랜드 | 헤더 안 `PublicLogo`(마크 36px + MCS + 영문 부제) | `.login-brand` **화면 좌상단 고정** 18px/700 |

---

## 3. 그대로 인용 가능한 것 — 법률 문서

**있다. 그리고 우리 저장소에는 약관·처리방침이 아예 없다**(`grep "이용약관\|개인정보"` → 화면·코드 0건).

| 문서 | 자리 | 분량(실측) |
|---|---|---|
| **이용약관 및 크레딧 정책** | `apps/web/app/_landing/legal/documents.ts` 의 `TERMS_DOC.body` | **3,759자 · 논리 117줄** |
| **개인정보 처리방침** | 같은 파일 `PRIVACY_DOC.body` | **3,974자 · 논리 131줄 · 표 25행** |
| 파서 | `apps/web/app/_landing/legal/render.ts` (113줄) | 자체 마크다운 파서 — 제목/문단/목록/표 4가지만 |
| 화면 | `apps/web/app/_landing/legal/LegalLinks.tsx` (151줄) | **모달**. 별도 라우트 없음 — `#terms` / `#privacy` 해시로만 |
| 판 | `apps/web/app/_landing/legal/__tests__/render.test.ts` (131줄) | 문서 2개 고정 · 시행일 문자열 고정 · 빈칸 8개 금지 |

`documents.ts` 는 29줄인데 18KB 다 — **본문이 한 줄짜리 문자열에 `\n` 이스케이프로 박혀 있다.**

### 조항 목록

**이용약관** (`# MCS 이용약관 및 크레딧 정책 — 충전형 서비스 초안`, 시행일 2026년 9월 10일)
제1조 목적 / 제2조 서비스와 크레딧 / 제3조 회원가입과 계정 관리 / 제4조 결제와 크레딧 지급 /
제5조 크레딧 차감 / 제6조 크레딧 유효기간과 사용 순서 / 제7조 청약철회와 환불 /
제8조 입력 자료와 생성 결과물 / 제9조 AI 결과의 특성 / 제10조 이용 제한 /
제11조 탈퇴와 서비스 종료 / 제12조 약관 변경과 분쟁 처리

**개인정보 처리방침** (`# MCS 개인정보 처리방침 — 게시 전 확인용 초안`, 시행일 2026년 9월 10일)
1. 처리 목적·항목·보유기간 / 2. 법령에 따른 보관 / 3. 처리업무의 위탁 / 4. 국외 이전 /
5. 제3자 제공 / 6. 입력 자료와 AI 처리 / 7. 파기 / 8. 이용자의 권리와 행사 방법 /
9. 아동의 개인정보 / 10. 안전성 확보조치 / 11. 쿠키 등 자동 수집 장치 /
12. 개인정보 보호 담당자 / 13. 처리방침 변경

### 인용 판정

**뼈대는 그대로 쓸 수 있다. 다만 그대로 복사하면 안 되는 자리가 확실하다.**

바꿔야 할 고유값(원문 그대로):

- 회사·서비스명 — `이 약관은 fixup(이하 "회사")이 제공하는 MCS 서비스의 …`,
  `fixup(이하 "회사")은 MCS(Marketing Content Studio) 서비스를 제공하면서 …`,
  `MCS는 생성형 AI를 사용합니다.`, `MCS는 만 14세 이상 이용자를 대상으로 운영합니다.`
- **개인 gmail 4곳** — `9843ohs@gmail.com` (약관 제7조·제12조, 처리방침 8·12)
- **개인 실명** — 처리방침 12조 `개인정보 보호책임자 또는 담당부서: 정인수` / `개인정보 열람·고충 처리 담당: 정인수`
- 제품 고유 개념 — 제2조 `MCS는 AI를 활용하여 카드뉴스, 광고 이미지, 포스터, 상세페이지, 캐릭터 등의 …`,
  `"생성 방식"은 회원이 화면에서 고르는 이미지 생성 방식(표준형·정밀형·속도형·경제형 등)을 말합니다.`
  → **우리는 영상이라 통째로 다시 써야 한다.** 다만 크레딧 모델 문장(제4~7조)은 우리 `lib/pricing.js` 구조와 잘 맞는다.
- 벤더 — 처리방침 3.에 `[fal.ai 계약 상대방의 정확한 법인명]`. **우리도 fal 을 쓰니 이 항목은 오히려 필요하다.**

**★ 결정적 경고 — 처리방침은 아직 초안이다.**

- 제목이 `— 게시 전 확인용 초안`이고, 본문에 **대괄호 빈칸이 31개** 남아 있다
  (`[결제대행업체의 정확한 법인명]` · `[실제 저장·처리·접근 국가]` · `[전화번호]` …),
  게다가 **편집자용 지시문(`[게시 전 확인: …]`) 5개가 그대로 화면에 렌더된다** — 파서가 대괄호를 특별 취급하지 않는다.
- 약관에도 빈칸 3개(`[전화번호]` · `[환불 메뉴]` · `[회원 탈퇴 경로]`).
- **사업자등록번호·통신판매업 신고번호·대표자·주소가 두 문서 어디에도 없다**(전자상거래법 표시의무 미충족).
- 그쪽 테스트는 **이미 채운 빈칸 8개만** 재발 방지로 막는다. 남은 34개는 아무도 안 잡는다.

→ **인용은 "구조와 조항 순서"까지가 안전하고, 문안은 우리 사실관계로 채운 뒤 법률 검토를 받아야 한다.**
그쪽 파일 머리말이 원본을 `frontend/법률문서/` 라고 가리키는데 **그 폴더는 저장소에 없다** —
지금은 `documents.ts` 가 유일본이다.

---

## 4. 우리에게 옮길 때의 작업 목록

### 4-0. 옮기지 말아야 할 것부터

- **Tailwind·shadcn 도입은 이번 범위에 넣지 마라.** 우리 판 15개 중 6개가
  `app/globals.css` 를 **문자열로 훑어** 잰다(`cssWithoutRoot()` · `cssRules()`).
  유틸리티 클래스로 옮기는 순간 그 판들이 **아무것도 안 재는 빈 그물**이 된다
  (규칙이 CSS 파일에서 사라지므로 위반이 0으로 나온다 — 판은 초록인데 계약은 없다).
- **랜딩(WebGL 히어로)은 안 건드린다**(지시대로). 참고만.
- **어두운 벌(`.dark` + next-themes)은 옮기지 마라.** 우리 판
  `테마는 한 벌이다 › data-theme 흔적이 코드에 없다` 가 명시적으로 그것을 지운 결과다.
  ⚠️ 단, MCS 는 `attribute="class"` 라 문자열이 `data-theme` 이 아니라 `.dark` 다 —
  **그대로 옮기면 우리 판을 통과한다.** 판은 통과하는데 결정은 뒤집히는 자리다.

### 4-1. 파일별 작업

| # | 파일 | 무엇을 | 판 충돌 |
|---|---|---|---|
| 1 | `app/globals.css` `:root` | `--subtle-foreground #87867f`(3번째 글자 톤)·`--border-soft #f0eee6`·`--primary-ring rgba(176,68,106,.35)` 추가 검토 | **없음** — 기대 표는 "있어야 할 토큰"만 잰다. 다만 `--accent-ring` 처럼 `--accent` 로 시작하는 이름을 쓰면 **액센트 판에 걸린다**(아래 4-2 ②) |
| 2 | `app/globals.css` `:root` | `--deep`(#EFEDE4) 을 MCS `--muted`(#efeee7) 에 맞출지 결정 | **기대 표에 `--deep: #EFEDE4` 가 박혀 있다** → 바꾸면 `tests/design-system.test.js:120` 도 함께 고쳐야 한다 |
| 3 | `app/globals.css` `:root` | `--good #0E7C57` ↔ MCS `--success #2f7d5f`, `--warn #9A6400` ↔ `--warning #b07d2a` 정합 | **기대 표에 둘 다 박혀 있다**(`:128`·`:129`) → 값을 바꾸면 판도 함께 |
| 4 | `app/globals.css` | 그림자 토큰 2개 신설 — `--ring: 0 0 0 1px var(--line)` · `--elevate: 0 4px 24px rgba(0,0,0,.05)`. 지금 우리 그림자는 8건이 각자 손으로 적혀 있다 | 없음(그림자 판 없음). rgba 는 hex 가 아니라 `:root` 밖에서도 안전 |
| 5 | `app/globals.css` | 카드 여백을 MCS 처럼 24px 한 값으로 — 우리 `.panel` 이 이미 `var(--sp-5)`(24px) 다. **이미 같다** | 없음 |
| 6 | `app/globals.css` + `components/Sidebar.jsx` | 사이드바 폭 `230px` → `clamp(236px,15vw,300px)` 검토 | 없음 |
| 7 | `app/globals.css` `main.work` | 본문 기둥 정책 — MCS 는 max-width 없음 + `clamp(16px,2.2vw,52px)` 여백. 우리는 1160px 고정 | 없음. **다만 뒤집으면 글줄이 길어진다**(주석에 그 이유가 적혀 있다) |
| 8 | `app/login/page.js` + `app/globals.css` | 로그인 화면을 MCS 형(두 기둥 + 온보딩 3단)으로 갈지 결정. 단계 원문자 금지 판이 있으므로 번호는 **숫자 글리프**로 | ★ `글리프 › 화면 문자열에 단계 원문자가 없다` — `①②③` 쓰면 즉시 빨강 |
| 9 | (신설) `app/legal/…` 또는 `components/LegalModal.jsx` | 약관·처리방침. MCS 의 `documents.ts`+`render.ts`+`LegalLinks.tsx` 구조를 그대로 옮길 수 있다(순수 JS 변환 필요) | `인라인 스타일 › style={{ }} 는 10곳 이하` — 모달을 인라인 스타일로 짜면 예산을 잡아먹는다 |
| 10 | `components/Sidebar.jsx` | 메뉴에 "설명서"를 **점선 테두리 강조**로 두는 발상(MCS `highlight`) — 선택(`채운 바탕`)과 강조(`테두리만`)를 갈랐다 | 강조에 `--accent` 계열을 쓰면 **액센트 판에 걸린다**(4-2 ②) |
| 11 | `app/*/page.js` 머리 | 화면 머리 관용구를 MCS 형으로: 눈썹(12px/600/+0.04em) → 제목 30px → 설명 14px. 우리 `.pgtitle`·`.pgsub` 이 이미 그 꼴이다 — **눈썹만 없다** | 눈썹을 11px 로 옮기면 **크기 판에 걸린다**(12px 로 내려야 한다) |

### 4-2. ★ `tests/design-system.test.js` 와 충돌하는 자리 (반드시 볼 것)

| # | MCS 의 값 | 우리 계약 | 결과 |
|---|---|---|---|
| ① | **`text-sm` = 13px (422회)** · `text-meta` = 11px (127회) · `text-h2` 17px · `text-h1` 22px · `text-[15px]` · `text-[10px]` · `text-[9px]` · `text-xl` 20 · `text-2xl` 24 · `text-5xl` 48 | `타이포 › font-size는 12·14·16·18·30px만 쓴다` (`.display` 만 면제) | **전부 빨강.** MCS 사다리를 그대로 들여올 수 없다. **13→14, 11→12, 17→18, 22→18 또는 30, 15→14 또는 16** 으로 접어야 한다. 실제로 이 저장소는 로그인 브랜드를 20px 로 적었다가 이 판에 걸려 18px 로 고친 이력이 주석에 남아 있다 |
| ② | `--primary`(=우리 `--accent`)를 **버튼·배지·활성 메뉴·단계 번호·브랜드에 전부** 쓴다 | `주 실행 버튼 › 액센트는 진행 중 단계 표시에만 쓴다` — `var(--accent…)` 를 쓸 수 있는 선택자는 **`.side-step.on` 하나**뿐(`.display` · `.home` 뿌리만 면제) | **버튼은 `--btn` 으로 써야 한다**(값이 같아 화면은 동일). ⚠️ 정규식이 `var\(--accent` 라 **`var(--accent-soft)` 도 함께 걸린다** — MCS 의 `bg-primary-soft`(활성 메뉴 바탕)를 옮길 때 정확히 여기서 터진다 |
| ③ | `font-medium`(500) 43회 · `font-extrabold`(800) 26회 · `font-black`(900) 5회 | `타이포 › font-weight는 400·600·700만 쓴다` + `전시층 글자는 .display 안에서만 쓴다`(800+ 파수꾼) | **500 은 600 으로, 800/900 은 `.display` 안으로.** shadcn 버튼 기본이 `font-medium`(500) 이라 **버튼을 옮기는 순간 걸린다** |
| ④ | `rounded-md`=12px(209회) · `rounded-lg`=14px(98) · `rounded-2xl`=16px · `rounded`=4px | `형태 › border-radius는 토큰 세 개와 50%만 쓴다` — `var(--r-card)`(16) · `var(--r-ctl)`(8) · `var(--r-pill)`(999) · `50%` · `inherit` · `0` | **12·14·4px 는 통과 못 한다.** 컨트롤은 8px, 카드는 16px 로 접는다. MCS 카드가 `rounded-xl`=**24px** 인 것도 우리 16px 로 내려앉는다 |
| ⑤ | `bg-gradient-to-br` 2건 · CSS `linear-gradient` 12건 · `radial-gradient` 1건 (랜딩 헤더 그늘 포함) | `형태 › 그라디언트를 쓰지 않는다` — `app/`·`components/` 전 파일에서 0건 | **하나라도 옮기면 빨강.** 랜딩 헤더의 "위에서 아래로 사라지는 그늘"이 대표적인 유혹 자리다 |
| ⑥ | `BrandMark` 가 **TSX 안에 `#6EE7A8` 을 박고**, 주석에 `#F2F2F0` · `#08080A` 를 적어 뒀다. `layout.tsx` 의 `themeColor: "#08080A"` 도 마찬가지 | `색 › :root 밖에는 hex 색 리터럴이 없다` — **JS/JSX 는 주석을 안 지우고 날 것으로 잰다** | **주석 속 hex 도 빨강.** 로고를 옮길 거면 색을 `:root` 토큰으로 빼고, 주석에도 hex 를 적지 마라 |
| ⑦ | `.dark` 클래스 + `next-themes` + 상시 노출 `ThemeToggle` | `테마는 한 벌이다 › data-theme 흔적이 코드에 없다` | **문자열이 달라서 판은 통과한다.** 그래서 더 위험하다 — 판이 못 막는 자리이니 **사람이 막아야 한다**(옮기지 않는다) |
| ⑧ | `lucide-react` 아이콘(SVG 컴포넌트) | `글리프 › 사이드바 아이콘이 유니코드 글리프가 아니다` | **오히려 우리 계약과 같은 방향.** 다만 의존성이 하나 늘고, 우리는 지금 인라인 SVG 라 굳이 바꿀 이유는 없다 |
| ⑨ | shadcn 컴포넌트는 `className` 조합(`cn()`)으로 스타일을 **JSX 안에** 둔다 | `인라인 스타일 › style={{ }} 는 10곳 이하` | `className` 은 `style={{}}` 가 아니라 **직접 걸리지는 않는다.** 다만 우리 판 6개가 `globals.css` 를 훑어 재므로 **규칙이 CSS 밖으로 나가면 계약이 증발한다**(4-0 참고) |
| ⑩ | `@font-face` 92장 자체 호스팅 | `서체 › layout.js 가 폰트를 실제로 주입한다`(`next/font/local` 필수) · `body 는 var(--font-pretendard) 를 쓴다` | **싣는 법을 MCS 식으로 바꾸면 두 판이 빨강.** 지금 방식을 유지하라. 게다가 우리 `globals.css` 에는 `"Pretendard Subtitle"` 같은 자막 패밀리가 6개 있어 **이름 충돌 함정**이 이미 있다 |
| ⑪ | 카드 여백 `p-6`(24px) · 버튼 높이 36px · 입력 높이 36px · 모달 폭 512px | 우리 `--ctl-sm/md/lg = 32/40/48px` · `.sent-input--lg` 52px · `.cta--block` 48px | 판은 없지만 **두 벌이 된다.** MCS 36px 을 그대로 들이면 우리 3단 사다리 밖의 4번째 키가 생긴다 → **40px(`--ctl-md`)로 접어라** |

---

## 5. 위험·주의

1. **★ 판을 통과하는데 계약이 사라지는 길이 있다.**
   우리 시각 계약은 `app/globals.css` 를 **문자열로 훑어** 잰다. Tailwind 유틸리티로 옮기면
   규칙이 CSS 파일에서 사라지고, 판은 "위반 0"이라며 초록이 난다. 이 저장소가 가장 싫어하는
   모양(아무도 안 알려 주는 조용한 격하)이 바로 이 자리에서 난다.

2. **★ 액센트 판이 `--accent-soft` 까지 잡는다.**
   정규식이 `var\(--accent` 라 `var(--accent-soft)` 도 매치된다. MCS 의 활성 메뉴/활성 단계
   바탕(`bg-primary-soft`)을 옮기면 **`.side-step.on` 밖에서는 전부 빨강**이다.
   버튼·배지는 `--btn` 으로, 옅은 바탕이 필요하면 `--deep`/`--surface2` 로 우회한다.

3. **★ 두 벌이 될 값들.** 옮기면서 새로 생기는 두 벌 후보:
   - **성공·경고색** — `#0E7C57`/`#9A6400` vs `#2f7d5f`/`#b07d2a`
   - **가라앉은 면** — `#EFEDE4` vs `#efeee7` (눈으로 구별 안 되는 3단위 차이가 가장 위험하다)
   - **컨트롤 키** — 우리 32/40/48 vs MCS 36
   - **카드 반경** — 우리 16 vs MCS 24
   - **글자 메타 톤** — 우리는 `--ink-soft` 하나, MCS 는 `--muted-foreground`+`--subtle-foreground` 둘
   전부 `CLAUDE.md` 의 "값이 사는 곳 — 두 벌이면 갈린다" 표에 걸릴 성질이다.

4. **깨질 화면.**
   - `.side-step.on`(사이드바 스테퍼) — MCS 처럼 **가로 StepBar** 로 옮기면 액센트 판의
     허용 선택자(`.side-step.on`)가 아무것도 안 잡아 `액센트를 쓰는 자리가 하나도 없다` 로 빨강난다.
     판을 함께 고치지 않으면 옮길 수 없다.
   - `.login-brand`(좌상단 고정 18px) — MCS 형 두 기둥 레이아웃으로 바꾸면 `position: fixed` 전제와
     `.work--bare` 세로 가운데 정렬이 충돌한다. `@media (max-height: 560px)` 예외까지 함께 봐야 한다.
   - `.done-stage .done-preview` — `--stage-dark` 를 실제로 쓰는지 판이 잰다. 완성 화면을
     MCS 카드로 갈아끼우다 그 규칙을 지우면 빨강.
   - `.home` 클래스 — 그 클래스를 다는 파일이 `app/home/page.js` 하나여야 한다는 판이 있다.
     MCS 랜딩 구조를 참고해 화면을 늘릴 때 이름이 새면 즉시 빨강.

5. **법률 문서를 그대로 붙이면 안 된다.**
   처리방침은 제목부터 `게시 전 확인용 초안`이고, 빈칸 31개와 **편집자용 지시문 5개가 화면에 그대로 렌더**된다.
   개인 gmail(`9843ohs@gmail.com`)과 실명(`정인수`)이 본문에 박혀 있다.
   사업자등록번호·통신판매업 신고번호가 **없다**. 조항 뼈대만 가져오고 문안은 우리 사실관계로 다시 쓴다.
   그리고 우리 결제·환불 모델(`lib/pricing.js` 의 크레딧)과 약관 제4~7조가 잘 맞는지 대조해야 한다.

6. **약관에 닿는 길이 MCS 에도 없다.** 랜딩(`/`)과 `/about` 푸터 모달뿐이고,
   로그인·가입·스튜디오 화면에서는 약관에 닿을 수 없다. **가입 화면의 동의 절차가 없다** —
   우리가 옮길 때 그 구멍까지 같이 옮기지 않도록 주의.

7. **TS → JS 변환 비용.** MCS 부품은 전부 `.tsx` + Radix + cva 다. 우리는 순수 JS 에
   타입체커가 없다. **부품을 코드로 옮기는 것보다 "치수와 규칙을 읽어 우리 CSS 어휘로 다시 쓰는" 편이
   싸다** — 실제로 색은 이미 그렇게 옮겨져 있다.

8. **우리 저장소는 이번 조사에서 한 글자도 수정하지 않았다.** 읽기(`cat`/`grep`/`sed`)만 했고,
   마지막에 `git status --porcelain` 으로 확인했다 — **출력 0줄(깨끗함)**.

---

## 부록 — 주요 파일 절대경로

**MCS (참고 원본)**
```
C:\Users\fixup\fixup-image-agent\packages\ui\src\styles\globals.css          ← 디자인 토큰 (312줄)
C:\Users\fixup\fixup-image-agent\packages\ui\src\components\app-shell.tsx    ← 앱 껍데기
C:\Users\fixup\fixup-image-agent\packages\ui\src\components\step-bar.tsx     ← 가로 단계 표시
C:\Users\fixup\fixup-image-agent\packages\ui\src\components\brand-mark.tsx   ← 로고 (하드코딩 #6EE7A8)
C:\Users\fixup\fixup-image-agent\packages\ui\src\components\ui\{button,card,input,textarea,badge,label,dialog,tabs,side-panel}.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\globals.css                    ← 4줄 (토큰 import + @source)
C:\Users\fixup\fixup-image-agent\apps\web\app\pretendard.css                 ← @font-face 92장
C:\Users\fixup\fixup-image-agent\apps\web\app\layout.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\login\page.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\signup\page.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\_components\auth-shell.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\_components\public-shell.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\_components\studio-layout.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\_landing\legal\documents.ts    ← 약관·처리방침 본문
C:\Users\fixup\fixup-image-agent\apps\web\app\_landing\legal\render.ts
C:\Users\fixup\fixup-image-agent\apps\web\app\_landing\legal\LegalLinks.tsx
C:\Users\fixup\fixup-image-agent\apps\web\app\_landing\landing.css           ← 랜딩 전용 토큰 (1456줄)
C:\Users\fixup\fixup-image-agent\apps\web\app\_landing\hero\hero.css         ← .mcs-dark 덮어쓰기 (770줄)
C:\Users\fixup\fixup-image-agent\apps\web\app\__tests__\webfont.test.ts
C:\Users\fixup\fixup-image-agent\docs\superpowers\specs\2026-07-21-ui-overhaul-design.md  ← 설계 근거
C:\Users\fixup\fixup-image-agent\docs\overview\screenshots\                  ← 화면 캡처 7장
```

**우리 (대조 대상 — 수정하지 않음)**
```
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\app\globals.css              (2903줄)
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\components\AppShell.jsx       (69줄)
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\app\login\page.js             (175줄)
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\tests\design-system.test.js   (469줄)
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\app\layout.js
C:\Users\fixup\shotform-saas\.claude\worktrees\step-gate\CLAUDE.md                     ← 「값이 사는 곳」 표
```
