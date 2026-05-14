import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tokenParamSchema } from "@/lib/signatures/schemas";
import { loadPublicSignatureByToken, isExpired } from "@/lib/signatures/public";
import { centsToDollars } from "@/lib/estimating/schemas";
import { SignaturePadForm } from "./signature-pad-form";

export const metadata: Metadata = {
  title: "Review & sign",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parsed = tokenParamSchema.safeParse({ token });
  if (!parsed.success) notFound();

  const view = await loadPublicSignatureByToken(parsed.data.token);
  if (!view) notFound();

  const expired = isExpired(view);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {view.workspace_name ?? "1collective workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {view.target_label}
          </h1>
        </header>

        <section className="mb-6 rounded-xl bg-slate-50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Amount
          </p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">
            ${centsToDollars(view.amount_cents).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </section>

        {view.description ? (
          <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {view.description}
          </section>
        ) : null}

        {view.status === "signed" ? (
          <SignedBanner name={view.signed_by_name} signedAt={view.signed_at} />
        ) : view.status === "declined" ? (
          <DeclinedBanner declinedAt={view.declined_at} />
        ) : view.status === "voided" ? (
          <InfoBanner title="Request withdrawn">
            This request was withdrawn by the sender. Please contact them
            directly.
          </InfoBanner>
        ) : expired || view.status === "expired" ? (
          <InfoBanner title="Request expired">
            This signature link has expired. Please ask the sender for a new
            one.
          </InfoBanner>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              By signing below you authorize the work described above and agree
              to pay the amount shown. This becomes part of your contract.
            </p>
            <SignaturePadForm token={parsed.data.token} />
          </>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">
          Powered by 1collective
        </footer>
      </div>
    </main>
  );
}

function SignedBanner({
  name,
  signedAt,
}: {
  name: string | null;
  signedAt: string | null;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-emerald-800">Signed</h2>
      <p className="mt-1 text-sm text-emerald-700">
        {name ? `Signed by ${name}` : "This document has been signed."}
        {signedAt ? ` on ${new Date(signedAt).toLocaleString()}` : ""}.
      </p>
    </div>
  );
}

function DeclinedBanner({ declinedAt }: { declinedAt: string | null }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-rose-800">Declined</h2>
      <p className="mt-1 text-sm text-rose-700">
        This request was declined
        {declinedAt ? ` on ${new Date(declinedAt).toLocaleString()}` : ""}.
      </p>
    </div>
  );
}

function InfoBanner({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </div>
  );
}
