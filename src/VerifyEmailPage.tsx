import React, { useEffect, useState } from 'react';
import { useAuth, PENDING_VERIFICATION_EMAIL_KEY } from './utils/authContext';
import { Button } from './components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './components/ui/input-otp';
import { MailCheck } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { user, verifyEmailCode, resendVerificationCode } = useAuth();
  const [email] = useState(() => sessionStorage.getItem(PENDING_VERIFICATION_EMAIL_KEY) ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // No pending email (deep link / refresh after success): nothing to verify here.
  useEffect(() => {
    if (!email) window.location.hash = '#/login';
  }, [email]);

  // After verifyOtp succeeds, onAuthStateChange loads the profile; route by status.
  useEffect(() => {
    if (verified && user) {
      window.location.hash = user.status === 'approved' ? '#/community' : '#/verification';
    }
  }, [verified, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleVerify = async () => {
    if (code.length !== 6 || loading) return;
    setError('');
    setLoading(true);
    const result = await verifyEmailCode(email, code);
    setLoading(false);
    if (result.success) {
      setVerified(true);
    } else {
      setError(result.message);
      setCode('');
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    const result = await resendVerificationCode(email);
    if (result.success) {
      setInfo(result.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.message);
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[#111] mb-2">Campus Connect</h1>
          <p className="text-[#666]">Verify your email</p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <MailCheck className="w-8 h-8 text-[#0b5fff]" />
            </div>
          </div>

          <h2 className="text-[#111] mb-2">Check your inbox</h2>
          <p className="text-[#666] text-sm mb-6">
            We sent a 6-digit code to <span className="text-[#111]">{email}</span>.
            Enter it below to activate your account.
          </p>

          <div className="flex justify-center mb-6">
            <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={handleVerify}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-blue-50 border border-blue-200 text-[#333] px-4 py-3 rounded-lg text-sm mb-4">
              {info}
            </div>
          )}

          <Button
            onClick={handleVerify}
            disabled={loading || verified || code.length !== 6}
            className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc] mb-4"
          >
            {verified ? 'Verified! Redirecting...' : loading ? 'Verifying...' : 'Verify Email'}
          </Button>

          <p className="text-sm text-[#666]">
            Didn't receive it?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-[#0b5fff] hover:underline disabled:text-[#999] disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
        </div>

        <p className="text-center text-sm text-[#666] mt-6">
          <button
            type="button"
            onClick={() => (window.location.hash = '#/login')}
            className="text-[#666] hover:text-[#0b5fff] hover:underline"
          >
            Back to Sign In
          </button>
        </p>
      </div>
    </div>
  );
}
