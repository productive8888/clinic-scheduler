import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md rounded-md border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-950">Clerk is not configured</h1>
          <p className="mt-2 text-sm text-slate-500">
            Add Clerk keys to the environment to enable hosted sign-up.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <SignUp />
    </main>
  );
}
