export default async function PayDonePage() {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-lg border bg-white p-6 shadow-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight">Payment received</h1>
        <p className="mt-2 text-sm text-gray-600">
          Thank you. A receipt has been emailed to you by Stripe and your
          balance has been updated.
        </p>
      </div>
    </div>
  );
}
