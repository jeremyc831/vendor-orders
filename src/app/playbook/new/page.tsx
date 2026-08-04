'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import SopEditor from '@/components/SopEditor';
import type { Mistake, Sop, SopInput } from '@/types/playbook';
import { formatDate } from '@/lib/playbook';

function NewSopInner() {
  const searchParams = useSearchParams();
  const mistakeId = searchParams.get('mistake');
  const fromRef = searchParams.get('from');

  const [prefill, setPrefill] = useState<Partial<SopInput> | null>(null);
  const [sourceMistake, setSourceMistake] = useState<Mistake | null>(null);
  const [loading, setLoading] = useState(!!(mistakeId || fromRef));

  useEffect(() => {
    if (!mistakeId && !fromRef) return;
    (async () => {
      try {
        if (mistakeId) {
          const res = await fetch(`/api/playbook/mistakes/${mistakeId}`);
          if (res.ok) {
            const { mistake } = (await res.json()) as { mistake: Mistake };
            setSourceMistake(mistake);
            setPrefill({
              purpose: mistake.description,
              category: 'field',
              status: 'draft',
              bodyMd: `From the mistake log — ${formatDate(mistake.happenedOn)}${
                mistake.jobRef ? `, job ${mistake.jobRef}` : ''
              }: ${mistake.description}`,
            });
          }
        } else if (fromRef) {
          const res = await fetch(`/api/playbook/sops/${fromRef}`);
          if (res.ok) {
            const { sop } = (await res.json()) as { sop: Sop };
            setPrefill({
              title: sop.title,
              purpose: sop.purpose,
              trigger: sop.trigger,
              category: sop.category,
              owner: sop.owner,
              steps: sop.steps,
              videoUrl: sop.videoUrl,
              photoUrls: sop.photoUrls,
              bodyMd: sop.bodyMd,
              status: 'draft',
            });
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [mistakeId, fromRef]);

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <Link href="/playbook" className="text-sm text-slate-400 hover:text-white transition">
            ← Playbook
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">New SOP</h1>
          {sourceMistake && (
            <p className="text-sm text-amber-300/90 mt-1">
              Converting mistake from {formatDate(sourceMistake.happenedOn)} — it gets linked to this SOP on save.
            </p>
          )}
          {fromRef && !sourceMistake && !loading && (
            <p className="text-sm text-slate-400 mt-1">Duplicated — rename it and make it yours. Saves as a new draft.</p>
          )}
        </header>

        {loading ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">Loading…</div>
        ) : (
          <SopEditor existing={null} prefill={prefill ?? undefined} fromMistakeId={sourceMistake?.id} />
        )}
      </div>
    </div>
  );
}

export default function NewSopPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background py-6 px-4">
          <div className="max-w-3xl mx-auto bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">
            Loading…
          </div>
        </div>
      }
    >
      <NewSopInner />
    </Suspense>
  );
}
