import Link from "next/link";

export default function VerifyRequestPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
          Secure link sent
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Open the magic link from the same device or browser to finish signing
          in.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Back to login
        </Link>
      </div>
    </main>
  );
}
