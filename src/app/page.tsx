import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Calendar,
  FileText,
  Hammer,
  HardHat,
  PhoneCall,
  Plug,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "CRM",
    body: "Customers, jobs, and conversations in one place — texts, calls, and emails threaded against the right job.",
  },
  {
    icon: FileText,
    title: "Estimating",
    body: "Build estimates from your own unit-price catalog. Convert won estimates into projects in one click.",
  },
  {
    icon: Calendar,
    title: "Scheduling",
    body: "Crew scheduling, daily assignments, and time tracking against active projects.",
  },
  {
    icon: Receipt,
    title: "Invoicing",
    body: "Native invoices and payments with two-way QuickBooks Online sync. No double-entry.",
  },
  {
    icon: PhoneCall,
    title: "AI Phone",
    body: "Daniella answers inbound, Serana places outbound — both book jobs straight into the calendar.",
  },
  {
    icon: ShieldCheck,
    title: "Document Vault",
    body: "Encrypted storage for COIs, W-9s, plans, and contracts — tenant-isolated by default.",
  },
];

const TRADES = [
  { icon: Wrench, label: "Plumbing" },
  { icon: Zap, label: "Electrical" },
  { icon: HardHat, label: "Mechanical / HVAC" },
  { icon: Hammer, label: "Concrete & Steel" },
  { icon: Plug, label: "Fire Protection" },
  { icon: Wallet, label: "General Contracting" },
];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-base font-semibold tracking-tight">One Collective</div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Operations software for the trades.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-[var(--color-muted-foreground)]">
          The back-office backbone for blue-collar businesses. Replace the patchwork
          of spreadsheets, texts, and disconnected tools with one system that runs
          the whole job — from first call to final invoice.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              Sign in <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-[var(--color-muted-foreground)]">
          Access by invite. Contact your platform operator to get started.
        </p>
      </section>

      <section className="border-t bg-[var(--color-muted)]/30 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One system. Every job. End to end.
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
              Marketing, sales, delivery, and accounting — modeled the way a trades
              business actually works.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{f.body}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for the trades that build everything.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
            Configurable workflows for the specialty crews that keep projects moving.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {TRADES.map((t) => (
              <div
                key={t.label}
                className="flex flex-col items-center gap-2 rounded-lg border p-6"
              >
                <t.icon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
                <span className="text-sm font-medium">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Stop bouncing between five tools.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-[var(--color-muted-foreground)]">
          One Collective replaces the stack you&apos;ve cobbled together — and gives
          your crews and your office the same single view of every job.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/login">
              Sign in <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t px-6 py-6 text-xs text-[var(--color-muted-foreground)]">
        © {new Date().getFullYear()} One Collective
      </footer>
    </main>
  );
}
