'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SopEditor from '@/components/SopEditor';
import type { Sop } from '@/types/playbook';

export default function EditSopPage() {
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

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <Link href={`/playbook/${slug}`} className="text-sm text-slate-400 hover:text-white transition">
            ← Back to SOP
          </Link>
          <h1 className="text-2xl font-bold text-white mt-1">{sop ? `Edit: ${sop.title}` : 'Edit SOP'}</h1>
        </header>

        {error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">{error}</div>
        ) : !sop ? (
          <div className="bg-card rounded-lg border border-card-border p-8 text-center text-slate-400">Loading…</div>
        ) : (
          <SopEditor existing={sop} />
        )}
      </div>
    </div>
  );
}
