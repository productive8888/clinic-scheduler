export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="min-h-screen bg-slate-100 text-slate-950">{children}</main>;
}
