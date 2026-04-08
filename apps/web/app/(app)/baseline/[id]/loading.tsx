export default function BaselineDetailLoading() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Baseline details
            </p>
            <div className="h-9 w-80 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-56 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="h-5 w-32 animate-pulse rounded bg-gray-100" />
        </div>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-100" />
          <div className="space-y-3">
            <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
          </div>
        </section>
      </div>
    </main>
  );
}
