#!/usr/bin/env bash
# Task 0 실측 — Seedance 클립이 컷을 넘어 같은 목소리를 내는가.
#
# 왜 이것부터 재나: 한 편은 컷을 **따로 만들어 이어 붙인다**. 컷마다 목소리가 달라지면
# 한 편 안에서 화자가 바뀐 것처럼 들려 광고로 못 쓴다. 이것이 무너지면
# docs/superpowers/specs/2026-08-12-seedance-native-voice-design.md 가 통째로 성립하지 않는다.
#
# ⚠️ 유료다. fal 계정에서 직접 나간다(앱 크레딧이 아니다).
#    Seedance 2.0 = $0.3024/s · 4초 × 3개 = 12초 ≈ $3.63
#
# 쓰는 법:
#   bash scripts/measure/seedance-voice.sh
#
# FAL_KEY 는 .env.local 에서 읽는다.

set -euo pipefail
cd "$(dirname "$0")/../.."

if [ -z "${FAL_KEY:-}" ]; then
  FAL_KEY=$(grep -E '^FAL_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "\r")
fi
[ -n "$FAL_KEY" ] || { echo "FAL_KEY 를 못 찾았어요 (.env.local 확인)"; exit 1; }

OUT="docs/measurements/seedance-voice-raw"
mkdir -p "$OUT"

# ★ 세 컷이 **같은 인물·같은 목소리 서술**을 쓴다. 대사만 다르다.
#   그것이 이 실측의 요점이다 — 같은 한 줄을 실었을 때 목소리가 이어지는가.
WHO="20대 동양인 남성 농구 선수"
LOOK="짧은 검은 머리, 마른 근육형, 검정 민소매 유니폼과 빨강 반바지"
VOICE="중저음, 차분하고 단단한 톤"

IMG1="https://v3b.fal.media/files/b/0aa46597/w4qGpB3lc7zbc7yhAB-Md_gXrrgizm.png"
IMG2="https://v3b.fal.media/files/b/0aa44f77/7DP7ZVfAQ9__olKmaeXjo_1pZ8XVJI.png"
IMG3="https://v3b.fal.media/files/b/0aa44f77/aeK9wLKKFxgLXNggxwZ5l_gFlPaGto.png"

LINE1="이 신발은 발목을 덮는 하이톱입니다."
LINE2="착지할 때 미드솔이 충격을 흡수합니다."
LINE3="경기 중에 몸을 더 자유롭게 움직일 수 있습니다."

shoot() {
  local n="$1" img="$2" line="$3"
  echo "── 컷 $n 생성 중 (약 1~3분) …"
  # 프롬프트 모양은 lib/cuts.js 의 buildClipPrompt 가 만들 것과 같게 맞춘다 —
  # 여기서 잰 것이 구현 뒤에도 그대로 재현되어야 한다.
  jq -n --arg img "$img" --arg who "$WHO" --arg look "$LOOK" --arg voice "$VOICE" --arg line "$line" '{
    image_url: $img,
    duration: 4,
    aspect_ratio: "9:16",
    generate_audio: true,
    resolution: "720p",
    prompt: ("거의 정지 상태, 아주 느린 카메라 이동. " + $who + "(" + $look + ") speaks to the camera with natural lip sync. Voice: " + $voice + ". Says exactly, in Korean: \"" + $line + "\". The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters.")
  }' > "$OUT/req-$n.json"

  curl -s -X POST "https://fal.run/bytedance/seedance-2.0/image-to-video" \
    -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
    -d @"$OUT/req-$n.json" > "$OUT/res-$n.json"

  local url
  url=$(jq -r '.video.url // empty' "$OUT/res-$n.json")
  if [ -z "$url" ]; then
    echo "  ✗ 실패 — $OUT/res-$n.json 을 보세요"
    head -c 400 "$OUT/res-$n.json"; echo
    return 1
  fi
  echo "  ✓ $url"
  echo "$url" >> "$OUT/urls.txt"
}

: > "$OUT/urls.txt"
shoot 1 "$IMG1" "$LINE1"
shoot 2 "$IMG2" "$LINE2"
shoot 3 "$IMG3" "$LINE3"

echo
echo "════════ 세 클립을 이어서 들어 보세요 ════════"
cat "$OUT/urls.txt"
echo
echo "볼 것 넷:"
echo "  1. 컷 간 목소리가 같은가        ← 가장 중요. 다르면 설계가 성립하지 않는다"
echo "  2. 4초 안에서 말이 끝나는가 · 무음이 몇 초 남는가"
echo "  3. '중저음' 이 실제로 반영됐는가"
echo "  4. 자막을 요구하지 않았는데 화면에 글자가 나오는가"
