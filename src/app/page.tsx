import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

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

      <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="max-w-2xl text-5xl font-semibold tracking-tight sm:text-6xl">
          Operations software for the trades.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-[var(--color-muted-foreground)]">
          One Collective is the back-office backbone for blue-collar businesses —
          plumbing, mechanical, fire protection, concrete, steel, electrical, and
          general contracting. Replace the patchwork of spreadsheets, texts, and
          disconnected tools.
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

      <footer className="border-t px-6 py-4 text-xs text-[var(--color-muted-foreground)]">
        © {new Date().getFullYear()} One Collective
      </footer>
    </main>
  );
}
