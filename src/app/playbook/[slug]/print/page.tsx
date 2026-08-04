'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Mistake, Sop } from '@/types/playbook';
import { CATEGORY_LABELS, formatDate } from '@/lib/playbook';

/**
 * One-page print view for laminating. Always light — this page is for paper,
 * not the shop's dark theme. Checkboxes print empty so laminated copies can be
 * ticked with a dry-erase pen.
 */
export default function SopPrintPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<{ sop: Sop; mistakes: Mistake[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/playbook/sops/${slug}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'SOP not found' : `HTTP ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load SOP');
      }
    })();
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen bg-white text-black p-8">
        <p>{error}</p>
        <Link href="/playbook" className="underline">
          ← Playbook
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen bg-white text-black p-8">Loading…</div>;
  }

  const { sop, mistakes } = data;
  const topMistakes = mistakes.slice(0, 3);

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@page { margin: 0.5in; } @media print { body { background: #fff; } }`}</style>

      <div className="max-w-[7.5in] mx-auto p-6 print:p-0">
        <div className="flex items-center justify-between gap-4 mb-4 print:hidden">
          <Link href={`/playbook/${slug}`} className="text-sm text-slate-600 hover:text-black transition">
            ← Back to SOP
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-brand hover:bg-brand-light text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Print
          </button>
        </div>

        <header className="border-b-2 border-black pb-2 mb-3">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight">{sop.title}</h1>
            <span className="text-xs uppercase tracking-wide shrink-0">
              {CATEGORY_LABELS[sop.category]} · Hibernation Playbook
            </span>
          </div>
        </header>

        <div className="text-sm space-y-1 mb-4">
          {sop.trigger && (
            <p>
              <span className="font-bold">When:</span> {sop.trigger}
            </p>
          )}
          {sop.purpose && (
            <p>
              <span className="font-bold">Why:</span> {sop.purpose}
            </p>
          )}
        </div>

        <ol className="space-y-2 mb-5">
          {sop.steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <div className="shrink-0 w-[18px] h-[18px] mt-0.5 border-2 border-black" aria-hidden />
              <div className="text-sm leading-snug">
                {step.text}
                {!step.required && <span className="text-slate-500"> (optional)</span>}
                {step.photoPrompt && <div className="text-xs text-slate-600">📷 {step.photoPrompt}</div>}
              </div>
            </li>
          ))}
        </ol>

        {topMistakes.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-wide border-t border-black pt-2 mb-1">
              Common mistakes
            </h2>
            <ul className="text-xs space-y-0.5">
              {topMistakes.map(m => (
                <li key={m.id}>• {m.description}</li>
              ))}
            </ul>
          </div>
        )}

        <footer className="flex items-end justify-between gap-4 text-xs text-slate-700">
          <div className="space-y-0.5">
            {sop.owner && <div>Owner: {sop.owner}</div>}
            <div>
              Last reviewed {formatDate(sop.lastReviewedAt)} · v{sop.version}
            </div>
            {sop.videoUrl && <div>Video: scan the QR → Watch</div>}
          </div>
          {/* SVG from our own QR endpoint — next/image adds nothing for a local generated asset */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/playbook/qr/${sop.slug}`} alt="QR code to this SOP" className="w-20 h-20 shrink-0" />
        </footer>
      </div>
    </div>
  );
}
