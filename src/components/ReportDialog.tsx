import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { useBackableOverlay } from '../utils/useBackableOverlay';
import {
  CONTENT_NOUN,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  submitReport,
  type ContentType,
  type ReportReason,
} from '../utils/reports';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: ContentType;
  targetId: string;
}

type Step = 'form' | 'submitted' | 'duplicate';

/**
 * Menu → Report → reason → Submit → confirmation, for any post, listing,
 * event or comment. The server resolves the author itself, so nothing here
 * (or in the request) identifies who wrote it, and the author is never
 * told who reported it.
 */
export function ReportDialog({ open, onOpenChange, targetType, targetId }: ReportDialogProps) {
  const noun = CONTENT_NOUN[targetType];
  const [step, setStep] = useState<Step>('form');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State updates are async; a ref stops a fast double tap sending twice.
  const submittingRef = useRef(false);

  useBackableOverlay(open, () => onOpenChange(false));

  // Start fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setReason(null);
    setDetails('');
    setError(null);
  }, [open]);

  const detailsRequired = reason === 'other';
  const canSubmit =
    !!reason && (!detailsRequired || details.trim().length > 0) && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !reason || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitReport(targetType, targetId, reason, details);
      setStep(result === 'duplicate' ? 'duplicate' : 'submitted');
    } catch (err: any) {
      setError(err?.message || 'Couldn’t send your report. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Don't let an outside click / Escape throw away an in-flight submit.
  const handleOpenChange = (next: boolean) => {
    if (!next && isSubmitting) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto font-[Roboto]">
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#111]">Report {noun}</DialogTitle>
              <DialogDescription>
                Why are you reporting this? Your report is anonymous — the author won’t see who sent it.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-1.5">
                {REPORT_REASONS.map((r) => {
                  const selected = reason === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={isSubmitting}
                      onClick={() => { setReason(r.value); setError(null); }}
                      className={`flex items-start gap-3 w-full text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-60 ${
                        selected ? 'border-black bg-black/[0.03]' : 'border-[#e5e7eb] hover:bg-[#fafafa]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                          selected ? 'border-black' : 'border-[#c4c4c4]'
                        }`}
                      >
                        {selected && <span className="w-2 h-2 rounded-full bg-black" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[#111]">{r.label}</span>
                        <span className="block text-xs text-[#888]">{r.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {reason && (
                <div>
                  <label htmlFor="report-details" className="text-sm text-[#666] mb-1.5 block">
                    {detailsRequired ? 'What’s wrong? *' : 'Anything else? (optional)'}
                  </label>
                  <Textarea
                    id="report-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX_LENGTH))}
                    maxLength={REPORT_DETAILS_MAX_LENGTH}
                    disabled={isSubmitting}
                    placeholder="Add context for the moderators"
                    className="border-[#e5e7eb] rounded-lg min-h-[80px]"
                  />
                  <p className="text-xs text-[#999] text-right mt-1">
                    {details.length}/{REPORT_DETAILS_MAX_LENGTH}
                  </p>
                </div>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-[#dc2626] bg-[#fef2f2] rounded-lg px-3 py-2">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="rounded-full bg-black hover:bg-black/80 text-white disabled:opacity-40"
                >
                  {isSubmitting ? 'Sending…' : 'Submit report'}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <CheckCircle2 className="w-12 h-12 text-[#059669]" />
            <DialogHeader className="items-center">
              <DialogTitle className="text-[#111] text-center">
                {step === 'submitted' ? 'Thanks for letting us know' : 'Already reported'}
              </DialogTitle>
              <DialogDescription className="text-center">
                {step === 'submitted'
                  ? `Our moderators will review this ${noun}. We won’t share who reported it.`
                  : `You’ve already reported this ${noun}. Moderators are reviewing it.`}
              </DialogDescription>
            </DialogHeader>
            <Button
              onClick={() => onOpenChange(false)}
              className="rounded-full bg-black hover:bg-black/80 text-white mt-2 w-full sm:w-auto sm:px-8"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
