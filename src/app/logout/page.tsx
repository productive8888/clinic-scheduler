import Link from "next/link";
import { logoutAction } from "./actions";

export default function LogoutPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="grid max-w-md gap-4 rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div>
          <p className="text-sm font-medium uppercase tracking-normal text-emerald-800">
            Clinic Scheduler
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            Sign out
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            End this browser session for your account.
          </p>
        </div>
        <form action={logoutAction}>
          <button className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Sign out
          </button>
        </form>
        <Link
          href="/"
          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
        >
          Stay signed in
        </Link>
      </div>
    </main>
  );
}
