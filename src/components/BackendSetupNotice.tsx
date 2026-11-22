import { DatabaseZap } from 'lucide-react';
import { Button } from './ui/button';

interface BackendSetupNoticeProps {
  /** What's missing, e.g. "Reporting" or "Blocking statistics". */
  feature: string;
  /** Migration files that create the missing functions/tables. */
  migrations: string[];
  onRetry?: () => void;
  /** "member" hides admin/developer wording on user-facing pages. */
  audience?: 'admin' | 'member';
}

/**
 * Shown when the connected Supabase project doesn't have the functions a
 * screen needs yet (the migrations exist in the repo but haven't been
 * applied there). Says so plainly instead of showing a generic error or
 * pretending the feature works.
 */
export function BackendSetupNotice({ feature, migrations, onRetry, audience = 'admin' }: BackendSetupNoticeProps) {
  if (audience === 'member') {
    return (
      <div className="rounded-2xl border border-[#f0f0f0] bg-[#fafafa] p-5 font-[Roboto]" role="status">
        <p className="font-semibold text-[#111]">{feature} isn’t available yet</p>
        <p className="text-sm text-[#555] mt-1">It’s being switched on soon. Please check back later.</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" size="sm" className="rounded-full mt-4">Check again</Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-5 sm:p-6 font-[Roboto]" role="status">
      <div className="flex items-start gap-3">
        <DatabaseZap className="w-5 h-5 text-[#6366f1] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-[#111]">{feature} isn’t switched on yet</p>
          <p className="text-sm text-[#555] mt-1">
            This part of the dashboard is ready, but the database it needs hasn’t been set up yet, so
            members can’t send reports or block accounts until then. Nothing else is affected. Ask the
            developer to finish the setup — this page will start working on its own once that’s done.
          </p>
          {/* Technical detail for whoever applies the setup; folded away for moderators. */}
          <details className="mt-3 text-xs text-[#555]">
            <summary className="cursor-pointer select-none text-[#444] hover:text-[#111]">Technical details</summary>
            <p className="mt-1.5">The connected Supabase project is missing these migrations (apply on staging first):</p>
            <ul className="mt-1 space-y-0.5">
              {migrations.map((m) => (
                <li key={m} className="font-mono text-[#444] break-all">supabase/migrations/{m}</li>
              ))}
            </ul>
          </details>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm" className="rounded-full mt-4">
              Check again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
