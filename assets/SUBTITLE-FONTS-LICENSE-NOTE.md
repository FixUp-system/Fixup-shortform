# 자막 폰트 라이선스 안내

`assets/subtitle-ja.otf`(Noto Sans JP)와 `assets/subtitle-zh.otf`(Noto Sans SC)는
공식 `notofonts/noto-cjk` GitHub 릴리스, 태그 `Sans2.004`에서 받았다
(`16_NotoSansJP.zip`, `18_NotoSansSC.zip` 안의 `LICENSE` 파일 = SIL Open Font
License 1.1).

## 한국어 폰트 3종 (2026-08-14 추가)

기존에 이 저장소가 재배포하던 세 한국어 폰트는 출처 기록이 없었다. 폰트 파일의
OpenType `name` 테이블(nameID 13 = 라이선스 설명, nameID 14 = 라이선스 URL)을
직접 파싱해 실제 값을 확인했다 (기억이나 짐작이 아니라 파일에서 읽은 값):

- **`assets/subtitle-font.otf`**(Pretendard)
  - nameID 13: "This Font Software is licensed under the SIL Open Font
    License, Version 1.1. This license is available with a FAQ at:
    http://scripts.sil.org/OFL"
  - nameID 14: `http://scripts.sil.org/OFL`
- **`assets/subtitle-impact.ttf`**(Black Han Sans)
  - nameID 13: "This Font Software is licensed under the SIL Open Font
    License, Version 1.1. This license is available with a FAQ at:
    https://openfontlicense.org"
  - nameID 14: `https://openfontlicense.org`
- **`assets/subtitle-soft.ttf`**(Gowun Dodum)
  - nameID 13: "This Font Software is licensed under the SIL Open Font
    License, Version 1.1. This license is available with a FAQ at:
    https://scripts.sil.org/OFL"
  - nameID 14: `https://scripts.sil.org/OFL`

세 폰트 모두 **SIL Open Font License 1.1**이다 — CJK 폰트 두 종과 같은 라이선스다.

## 라이선스 원문은 파일 하나가 다섯 폰트를 함께 덮는다

전체 라이선스 원문은 같은 폴더의 `SUBTITLE-FONTS-LICENSE.txt`에 있다
(Noto CJK 릴리스의 `LICENSE` 파일을 그대로 내려받은 것 — 직접 옮겨 적지 않았다).
OFL-1.1 텍스트 자체는 폰트마다 다르지 않으므로, 이 파일 한 벌이 아래 다섯 폰트를
모두 덮는다:

- `subtitle-font.otf` (Pretendard)
- `subtitle-impact.ttf` (Black Han Sans)
- `subtitle-soft.ttf` (Gowun Dodum)
- `subtitle-ja.otf` (Noto Sans JP)
- `subtitle-zh.otf` (Noto Sans SC)

OFL-1.1은 폰트 재배포 시 라이선스 동봉을 요구하므로 이 노트와
`SUBTITLE-FONTS-LICENSE.txt`를 함께 둔다.

## 한국어 폰트 3종 추가 (2026-08-25)

사장님 지시로 결이 다른 셋을 더했다. 앞의 셋이 전부 고딕이라 명조·손글씨·둥근 고딕이 없었다.
전부 `github.com/google/fonts` 의 **`ofl/`** 경로에서 받았다.

| 파일 | 폰트 | 출처 | 라이선스 |
|---|---|---|---|
| `subtitle-serif.ttf` | Nanum Myeongjo | `ofl/nanummyeongjo/NanumMyeongjo-Regular.ttf` | SIL OFL 1.1 |
| `subtitle-hand.ttf` | Nanum Pen Script | `ofl/nanumpenscript/NanumPenScript-Regular.ttf` | SIL OFL 1.1 |
| `subtitle-round.ttf` | Jua | `ofl/jua/Jua-Regular.ttf` | SIL OFL 1.1 |

### 파일에서 직접 읽어 확인한 것 (짐작이 아니다)

`name` 테이블의 nameID 13(라이선스)·14(URL)을 파싱했다:

- **Nanum Pen Script · Jua** — nameID 13 에 `"This Font Software is licensed under the SIL
  Open Font License, Version 1.1"`, nameID 14 에 `http://scripts.sil.org/OFL`
- ⚠️ **Nanum Myeongjo** — nameID 13 이 `"NHN Corporation"` 뿐이고 **OFL 문구가 없다.**
  파일만 보면 라이선스를 알 수 없어, 함께 배포되는 `ofl/nanummyeongjo/OFL.txt` 를 확인했다:
  `Copyright (c) 2010, NHN Corporation` 로 시작하는 **SIL OFL 1.1 전문**이다.
  → 라이선스는 OFL 이 맞고, 그 사실은 **파일 밖(OFL.txt)에만** 적혀 있다.

### Reserved Font Name

나눔 계열은 예약 폰트 이름이 걸려 있다: `Nanum` · `Naver Nanum` · `NanumGothic` ·
`NanumMyeongjo` · `NanumBrush` · `NanumPen`.
OFL 에서 이 이름들은 **폰트를 수정해 재배포할 때** 못 쓴다 —
우리는 **수정 없이 그대로 싣기만** 하므로 해당 없다.

### 두 곳에 둔다

`public/fonts/`(브라우저 미리보기, @font-face)와 `assets/`(ffmpeg 굽기, fontsdir) **양쪽**에
같은 파일이 있어야 한다. 한쪽만 넣으면 **미리보기는 맞는데 영상은 기본 폰트로 구워진다** —
눈으로 안 잡히는 자리라 `tests/subtitle-fonts.test.js` 가 둘 다 잰다.

