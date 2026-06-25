import Link from "next/link";

export function PublicDocument({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <header className="border-b border-zinc-200 pb-8">
        <p className="text-sm font-semibold uppercase text-emerald-700">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-semibold text-zinc-950">{title}</h1>
        {updated ? <p className="mt-3 text-sm text-zinc-600">Effective {updated}</p> : null}
      </header>

      <article className="space-y-8 py-8 text-base leading-7 text-zinc-700">{children}</article>

      <footer className="flex flex-wrap gap-5 border-t border-zinc-200 pt-6 text-sm font-medium">
        <Link className="text-emerald-800 underline" href="/privacy">Privacy</Link>
        <Link className="text-emerald-800 underline" href="/terms">Terms</Link>
        <Link className="text-emerald-800 underline" href="/support">Support</Link>
      </footer>
    </main>
  );
}

export function DocumentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-zinc-950">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
