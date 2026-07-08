import Link from "next/link";
import Hero3D from "../../../components/hero3d/Hero3D";
import { HERO3D_LAYERS } from "../../../lib/hero3d/hero3dLayers";

export const metadata = {
  title: "Hero3D Preview · Hyper to Be Free",
  description:
    "Experimental layered sunrise hero with CSS transform parallax for HTBF.",
};

export default function Hero3DPreviewPage() {
  return (
    <div className="min-h-screen bg-[#f8fbff] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-heading font-bold uppercase tracking-[0.2em] text-[#0b63ce]">
              Experimental preview
            </p>
            <h1 className="font-heading text-xl font-black text-[#062a57] sm:text-2xl">
              Hero3D · Layered sunrise
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-heading font-bold text-[#082f63] shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b63ce]/35 focus-visible:ring-offset-2"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Hero3D showMotionBadge className="w-full">
          <p className="text-sm font-heading font-bold uppercase tracking-[0.18em] text-blue-100/90">
            Hyper to Be Free
          </p>
          <h2 className="mt-2 font-display text-3xl font-black leading-tight text-white sm:text-4xl">
            Freedom in every sunrise
          </h2>
          <p className="mt-3 text-sm leading-6 text-blue-50/90 sm:text-base sm:leading-7">
            Move your pointer on desktop, or tilt your phone where supported. With
            reduced motion enabled, the scene stays calm and static.
          </p>
        </Hero3D>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
            <h3 className="font-heading text-lg font-black text-[#062a57]">
              Layer architecture
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Seven stacked planes from deep sky to atmospheric haze. The HTBF
              silhouette image sits near the focal plane with the lowest depth
              factor so it stays anchored while background layers shift.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-slate-700">
              {HERO3D_LAYERS.map((layer) => (
                <li
                  key={layer.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                >
                  <span className="font-medium">{layer.label}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    depth {layer.depth.toFixed(2)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
            <h3 className="font-heading text-lg font-black text-[#062a57]">
              Performance & accessibility
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>
                Parallax updates run on{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  requestAnimationFrame
                </code>{" "}
                and write directly to layer transforms — no React re-render per
                frame.
              </li>
              <li>
                Only GPU-friendly{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  translate3d
                </code>{" "}
                is used; layers set{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  will-change: transform
                </code>
                .
              </li>
              <li>
                Honors{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  prefers-reduced-motion
                </code>{" "}
                with a static fallback.
              </li>
              <li>
                Desktop uses pointer parallax; coarse-pointer devices can use
                device orientation when permitted.
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
