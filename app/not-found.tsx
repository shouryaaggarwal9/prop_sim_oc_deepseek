import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="font-mono text-5xl font-bold text-emerald-500">404</p>
        <h1 className="mt-3 text-lg font-bold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          QuantProp India is a single-page simulator; there is nothing at this address.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition"
        >
          Back to the Prop Terminal
        </Link>
      </div>
    </div>
  );
}