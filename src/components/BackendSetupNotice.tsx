import { DatabaseZap } from 'lucide-react';
import { Button } from './ui/button';

interface BackendSetupNoticeProps {
  /** What's missing, e.g. "Reporting" or "Blocking statistics". */
  feature: string;
  /** Migration files that create the missing functions/tables. */
  migrations: string[];
  onRetry?: () => void;
}

/**
 * Shown when the connected Supabase project doesn't have the functions a
 * screen needs yet (the migrations exist in the repo but haven't been
 * applied there). Says so plainly instead of showing a generic error or
 * pretending the feature works.
 */
export function BackendSetupNotice({ feature, migrations, onRetry }: BackendSetupNoticeProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d4d4d8] bg-[#fafafa] p-5 sm:p-6 font-[Roboto]" role="status">
      <div className="flex items-start gap-3">
        <DatabaseZap className="w-5 h-5 text-[#6366f1] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-[#111]">{feature} isn’t set up on this database yet</p>
          <p className="text-sm text-[#666] mt-1">
            The screen is ready, but the connected Supabase project doesn’t have the server functions it needs.
            Nothing is broken and no data is missing. Once these migrations are applied (staging first), this will load automatically:
          </p>
          <ul className="mt-2 space-y-0.5">
            {migrations.map((m) => (
              <li key={m} className="text-xs font-mono text-[#444] break-all">supabase/migrations/{m}</li>
            ))}
          </ul>
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
