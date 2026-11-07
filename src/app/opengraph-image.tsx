import { ImageResponse } from "next/og";

export const alt = "Evenly, shared money that remembers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share image: the mark, the wordmark and one warm line of copy. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#faf8f3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div style={{ display: "flex", position: "relative", width: "120px", height: "120px" }}>
            <div style={{ position: "absolute", left: "8px", top: "24px", width: "72px", height: "72px", borderRadius: "50%", background: "#0e7a5f" }} />
            <div style={{ position: "absolute", left: "44px", top: "24px", width: "72px", height: "72px", borderRadius: "50%", background: "#f0a868", opacity: 0.85 }} />
          </div>
          <div style={{ fontSize: "92px", fontWeight: 700, color: "#1c2430", letterSpacing: "-2px" }}>Evenly</div>
        </div>
        <div style={{ marginTop: "36px", fontSize: "40px", color: "#5c6675", lineHeight: 1.35, maxWidth: "900px" }}>
          Shared money that remembers how your household splits things.
        </div>
        <div style={{ marginTop: "28px", fontSize: "26px", color: "#0e7a5f", fontWeight: 600 }}>
          Log it in one line. Settle in USDC on Sui.
        </div>
      </div>
    ),
    size,
  );
}
