"use client";

// 첫 화면의 **흩뿌린 콜라주** — 2026-09-28. 사장님이 고른 시안을 목업 그대로 옮긴 것이다.
//
// 🔴🔴 **이 저장소에서 영상 태그를 두는 유일한 손님 화면이다.** 2026-09-07 에 목록이 영상 태그를
//   물어서 화면을 여는 것만으로 전송량 할당량이 탔고 로그인까지 함께 죽었다. 그 뒤로
//   "랜딩에 `<video>` 금지"가 판 둘로 박혀 있었고, **사장님이 09-28 에 그것을 열기로 했다**
//   (두 번 확인했다: 「이대로 적용해줘」 · 「아니 지금 목업 그대로 적용해줘」).
//   그래서 그때와 **무엇이 다른지**를 여기 적어 둔다 — 다음 사람이 판단을 되짚을 수 있게:
//     · 09-07 은 `/api/renders/<id>.mp4` 였다. 요청마다 **함수가 깨어나고 Supabase egress** 가 나갔고
//       캐시가 없었다. 지금은 `public/reel/` 의 **정적 파일**이라 CDN 이 먹고 함수도 DB 도 안 깬다.
//     · 그때는 목록 **전부**가 자동으로 물었다. 지금은 **표지(jpg)만 깔고** 영상은
//       `lead` 둘만 자동, 나머지는 **올리거나 눌렀을 때** 그 한 편만 받는다.
//     · 그때는 완성본 원본이었다(편당 ~20MB). 지금은 **360px · 6초 · 무음**으로 줄인 것이다.
//   🔢 첫 화면이 실제로 받는 값: 표지 11장 288KB + 영상 2편 **169KB**. 전부 재생해도 1.4MB.
//   ⚠️ 그래도 **방문 수만큼 나간다.** `lead` 를 늘리거나 무거운 편으로 바꾸면 그만큼 곱해진다 —
//     바꾸려면 `lib/home-collage.js` 의 주석에 적어 둔 파일 크기를 보고 바꿔라.
//
// ★ 랜딩의 다른 부분은 여전히 **서버 컴포넌트**다. 클라이언트로 내려오는 것은 이 부품 하나이고,
//   하는 일도 셋뿐이다: 표지→영상 바꿔 달기 · 스크롤 시차 · 올린 칸 앞으로.
// ★ 자리·크기·시차 배율은 여기 없다 — `lib/home-collage.js` 한 곳이다(실측값이라 두 벌이면 갈린다).
//   ⚠️ 자리를 **인라인 스타일로 주지 마라.** 열한 칸이면 인라인 스타일 상한(저장소 전체 10곳,
//     tests/design-system.test.js)을 혼자 다 먹는다. 칸마다 `.p1`~`.p11` 을 달아 두었으니
//     자리도 자르는 위치(`--pos`)도 app/globals.css 가 그 클래스로 준다.
import { useEffect, useRef } from "react";
import { COLLAGE } from "../lib/home-collage.js";

export default function HomeCollage() {
  const fieldRef = useRef(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const plates = Array.from(field.querySelectorAll(".land-plate"));
    const vids = plates.map((p) => p.querySelector("video"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 데이터 절약 모드를 켠 사람에게는 **한 편도** 자동으로 받지 않는다(표지만 보인다).
    const saveData = navigator.connection && navigator.connection.saveData === true;
    const lite = reduce || saveData;

    const load = (v) => { if (v && !v.getAttribute("src")) v.setAttribute("src", v.dataset.src); };
    const play = (v) => {
      if (!v) return;
      load(v);
      const go = v.play();
      if (go && go.then) go.then(() => v.closest(".land-plate").classList.add("on")).catch(() => {});
      else v.closest(".land-plate").classList.add("on");
    };
    const rest = (v) => {
      if (!v || v.dataset.auto === "1") return;
      v.pause();
      v.closest(".land-plate").classList.remove("on");
    };

    vids.forEach((v, i) => {
      if (!v) return;
      const auto = !lite && COLLAGE[i].lead === true;
      v.dataset.auto = auto ? "1" : "0";
      if (auto) play(v);
    });

    // ★ 브라우저가 자동 재생을 막으면 표지만 보인다 — 첫 조작(누름·스크롤)에 한 번 더 시도한다.
    const kick = () => vids.forEach((v) => { if (v && v.dataset.auto === "1") play(v); });
    const kickOpts = { once: true, passive: true };
    window.addEventListener("pointerdown", kick, kickOpts);
    window.addEventListener("scroll", kick, kickOpts);

    const offs = plates.map((p, i) => {
      const enter = () => { field.classList.add("hot"); play(vids[i]); };
      const leave = () => { field.classList.remove("hot"); rest(vids[i]); };
      p.addEventListener("pointerenter", enter);
      p.addEventListener("pointerleave", leave);
      p.addEventListener("focus", enter);
      p.addEventListener("blur", leave);
      return () => {
        p.removeEventListener("pointerenter", enter);
        p.removeEventListener("pointerleave", leave);
        p.removeEventListener("focus", enter);
        p.removeEventListener("blur", leave);
      };
    });

    // 스크롤 시차 — 칸마다 배율이 달라서 앞의 칸이 먼저 빠져나간다.
    // ★ rAF 로 한 프레임에 한 번만 쓴다. scroll 마다 쓰면 스크롤이 끊긴다.
    let raf = null;
    const draw = () => {
      const y = window.scrollY;
      plates.forEach((p, i) => {
        p.style.transform = `translate3d(0,${(-y * (COLLAGE[i].par - 1)).toFixed(1)}px,0)`;
      });
      raf = null;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
    if (!reduce) {
      window.addEventListener("scroll", onScroll, { passive: true });
      draw();
    }

    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      offs.forEach((off) => off());
    };
  }, []);

  return (
    <div className="land-hero-field" ref={fieldRef} aria-hidden="true">
      {COLLAGE.map((t, i) => (
        <span key={t.file} className={`land-plate p${i + 1}`}>
          <span className="land-plate-in">
            {/* 표지가 먼저 깔린다. 앞의 다섯 장만 바로 받고 나머지는 브라우저에 맡긴다. */}
            <img
              className="land-poster"
              src={`/reel/${t.file}.jpg`}
              alt=""
              loading={i < 5 ? "eager" : "lazy"}
            />
            {/* ★ src 가 아니라 data-src 다 — 이게 이 화면의 **전송량 방어선**이다.
                여기에 src 를 적는 순간 열한 편이 방문마다 다 나간다. */}
            <video
              className="land-clip"
              data-src={`/reel/${t.file}.mp4`}
              muted
              loop
              playsInline
              preload="none"
            />
          </span>
          <span className="land-cap">{t.biz} · {t.way}</span>
        </span>
      ))}
    </div>
  );
}
