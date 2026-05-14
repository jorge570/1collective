"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";

const PAD_WIDTH = 480;
const PAD_HEIGHT = 180;
const STROKE = "#0F172A";
const STROKE_WIDTH = 2.5;

type Point = { x: number; y: number };
type Stroke = Point[];

function pointsToPath(pts: Point[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const p = pts[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y}`;
  }
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function buildSvgDataUri(strokes: Stroke[]): string {
  const paths = strokes
    .map(
      (s) =>
        `<path d="${pointsToPath(
          s
        )}" stroke="${STROKE}" stroke-width="${STROKE_WIDTH}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAD_WIDTH}" height="${PAD_HEIGHT}" viewBox="0 0 ${PAD_WIDTH} ${PAD_HEIGHT}" style="background:white">${paths}</svg>`;
  if (typeof window === "undefined") return "";
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function SignaturePadForm({ token }: { token: string }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState<"sign" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const router = useRouter();

  function relativePoint(e: ReactPointerEvent<SVGSVGElement>): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const p = relativePoint(e);
    setStrokes((prev) => [...prev, [p]]);
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    const p = relativePoint(e);
    setStrokes((prev) => {
      const next = prev.slice();
      next[next.length - 1] = [...next[next.length - 1], p];
      return next;
    });
  }

  function onPointerUp() {
    drawingRef.current = false;
  }

  function clear() {
    setStrokes([]);
  }

  async function submitSign() {
    setError(null);
    if (!name.trim()) {
      setError("Please type your full name.");
      return;
    }
    if (strokes.length === 0) {
      setError("Please draw your signature.");
      return;
    }
    setSubmitting("sign");
    const dataUri = buildSvgDataUri(strokes);
    try {
      const res = await fetch(`/api/sign/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), signature_data_uri: dataUri }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not submit signature. Please try again.");
        setSubmitting(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(null);
    }
  }

  async function submitDecline() {
    setError(null);
    setSubmitting("decline");
    try {
      const res = await fetch(`/api/sign/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not decline. Please try again.");
        setSubmitting(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(null);
    }
  }

  const empty = strokes.length === 0;
  const disabled = submitting !== null;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-700">
        Full name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none"
          placeholder="Your full legal name"
          maxLength={120}
          disabled={disabled}
          autoComplete="name"
        />
      </label>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Signature</p>
        <div className="relative rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}
            className="block h-44 w-full touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {strokes.map((s, i) => (
              <path
                key={i}
                d={pointsToPath(s)}
                stroke={STROKE}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {empty ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Sign here
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={clear}
            disabled={disabled || empty}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : null}

      <button
        type="button"
        onClick={submitSign}
        disabled={disabled}
        className="block w-full rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {submitting === "sign" ? "Submitting…" : "I authorize this document"}
      </button>
      <button
        type="button"
        onClick={submitDecline}
        disabled={disabled}
        className="block w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
      >
        {submitting === "decline" ? "Submitting…" : "Decline"}
      </button>
    </div>
  );
}
