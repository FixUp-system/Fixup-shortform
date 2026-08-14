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
