'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Sop } from '@/types/playbook';
import { CATEGORY_LABELS } from '@/lib/playbook';

/**
 * Printable ~3×5 QR card: laminate it, zip-tie it to the truck shelf or tape
 * it inside a cabinet. The QR opens the SOP page (steps + video).
 */
export default function SopQrCardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [sop, setSop] = useState<Sop | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/playbook/sops/${slug}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'SOP not found' : `HTTP ${res.status}`);
        const data: { sop: Sop } = await res.json();
        setSop(data.sop);
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

  if (!sop) {
    return <div className="min-h-screen bg-white text-black p-8">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`@page { margin: 0.5in; }`}</style>

      <div className="max-w-[7.5in] mx-auto p-6 print:p-0">
        <div className="flex items-center justify-between gap-4 mb-6 print:hidden">
          <Link href={`/playbook/${slug}`} className="text-sm text-slate-600 hover:text-black transition">
            ← Back to SOP
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-brand hover:bg-brand-light text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            Print card
          </button>
        </div>

        <div className="w-[5in] h-[3in] mx-auto border-2 border-dashed border-slate-400 print:border-solid print:border-black rounded-lg flex overflow-hidden">
          <div className="flex-1 min-w-0 p-4 flex flex-col justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-600">
                Hibernation Playbook · {CATEGORY_LABELS[sop.category]}
              </div>
              <h1 className="text-xl font-bold leading-tight mt-1">{sop.title}</h1>
              {sop.trigger && <p className="text-xs text-slate-700 mt-1 line-clamp-3">{sop.trigger}</p>}
            </div>
            <div className="text-[10px] text-slate-600">Scan for steps{sop.videoUrl ? ' + video' : ''}</div>
          </div>
          <div className="shrink-0 h-full aspect-square p-3">
            {/* SVG from our own QR endpoint — next/image adds nothing for a local generated asset */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/playbook/qr/${sop.slug}`} alt={`QR code: ${sop.title}`} className="w-full h-full" />
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4 print:hidden">
          Prints at 5″ × 3″ inside the dashed outline — cut on the line.
        </p>
      </div>
    </div>
  );
}
