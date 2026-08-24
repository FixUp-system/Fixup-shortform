"""목소리의 기본 주파수(F0)를 잰다 — "다른 목소리인가"를 귀가 아니라 숫자로 가른다.

  python3 scripts/measure/voice-f0.py probe-out/voice/man50.wav probe-out/voice/girl10.wav

★ 왜 F0 인가: 성별·나이대가 가장 크게 드러나는 값이다.
    50대 남성 ≈  85~155 Hz
    성인 여성 ≈ 165~255 Hz
    아동      ≈ 250~350 Hz
  정반대 둘을 시켰는데 F0 가 안 벌어지면 모델이 목소리를 못 바꾸는 것이다.

★ 자기상관(autocorrelation)으로 잰다. 외부 라이브러리는 numpy 하나뿐이다 —
  측정 스크립트가 무거운 의존성을 끌어오면 다음 사람이 못 돌린다.
"""
import sys, wave, numpy as np

SR_MIN, SR_MAX = 70, 400        # 사람 목소리가 사는 범위(Hz). 밖은 잡음으로 본다
FRAME, HOP = 1024, 256          # 16kHz 에서 64ms 창 · 16ms 이동
MIN_RMS = 0.01                  # 이보다 조용하면 무음으로 보고 안 센다


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getsampwidth() == 2, "16-bit PCM 이어야 한다"
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)
    return x / 32768.0, sr


def f0_frames(x, sr):
    """유성음 구간의 F0 들을 돌려준다."""
    out = []
    lo, hi = int(sr / SR_MAX), int(sr / SR_MIN)   # 지연(lag) 범위
    for i in range(0, len(x) - FRAME, HOP):
        f = x[i:i + FRAME]
        if np.sqrt(np.mean(f ** 2)) < MIN_RMS:
            continue                              # 무음
        f = f - f.mean()
        ac = np.correlate(f, f, mode="full")[FRAME - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        if len(seg) == 0:
            continue
        lag = lo + int(np.argmax(seg))
        # 자기상관 봉우리가 낮으면 유성음이 아니다(잡음·자음)
        if ac[lag] / ac[0] < 0.3:
            continue
        out.append(sr / lag)
    return np.array(out)


def label(f0):
    if f0 < 155: return "성인 남성대"
    if f0 < 265: return "성인 여성대"
    return "아동/고음대"


rows = []
for path in sys.argv[1:]:
    x, sr = read_wav(path)
    f = f0_frames(x, sr)
    if len(f) < 5:
        print(f"{path}: 유성음 프레임이 {len(f)}개 — 목소리가 거의 없다(나레이션이 안 나온 것일 수 있다)")
        rows.append((path, None, 0))
        continue
    med = float(np.median(f))
    rows.append((path, med, len(f)))
    print(f"{path}")
    print(f"  중앙 F0 : {med:6.1f} Hz  ({label(med)})")
    print(f"  범위    : {np.percentile(f,10):6.1f} ~ {np.percentile(f,90):6.1f} Hz")
    print(f"  유성 구간: {len(f)}프레임 ({len(f)*HOP/sr:.1f}초분)")

vals = [r[1] for r in rows if r[1]]
if len(vals) == 2:
    hi, lo = max(vals), min(vals)
    ratio = hi / lo
    print("\n" + "=" * 56)
    print(f"두 목소리의 F0 비율: {ratio:.2f}배  ({lo:.0f}Hz vs {hi:.0f}Hz)")
    # ★ 임계는 감이 아니라 위 표에서 나온다: 남성대(~120)와 아동대(~300)는 2.5배 차이다.
    #   1.3배면 같은 사람의 억양 변화 수준이라 "다른 목소리"라고 부를 수 없다.
    if ratio >= 1.8:
        print("→ 판정: **모델이 목소리를 바꿀 수 있다.** 지시한 대로 갈렸다.")
        print("   그러면 지금 밋밋한 원인은 모델이 아니라 **우리 지문**이다")
        print("   (시나리오가 늘 '20대 후반 한국 여성'을 지어낸다).")
    elif ratio >= 1.3:
        print("→ 판정: 조금 갈리지만 약하다. 지시가 부분적으로만 먹는다.")
    else:
        print("→ 판정: **모델이 목소리를 못 바꾼다.** 정반대를 시켰는데 같은 목소리다.")
        print("   프롬프트를 아무리 손봐도 소용없다 — 영상은 소리 없이 만들고")
        print("   (generate_audio: false) 목소리는 우리 TTS 로 입히는 구조로 가야 한다.")
