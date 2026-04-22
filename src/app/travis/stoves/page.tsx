'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import TravisOrderForm from '@/components/TravisOrderForm';

export default function TravisStovesPage() {
  const router = useRouter();

  const goHome = () => router.push('/');

  return (
    <div className="min-h-screen">
      <header className="bg-card border-b border-card-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4 cursor-pointer" onClick={goHome}>
          <Image src="/hibernation-logo.png" alt="Hibernation" width={48} height={48} className="rounded" />
          <div>
            <h1 className="text-xl font-bold text-white">The Order Desk</h1>
            <p className="text-sm text-slate-400">Hibernation Stoves & Spas</p>
          </div>
        </div>
        <button
          onClick={goHome}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <TravisOrderForm onOrderSent={goHome} />
      </main>
    </div>
  );
}
