import { useState } from 'react';
import { supabase } from './utils/supabaseClient';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[#111] mb-2">Campus Connect</h1>
          <p className="text-[#666]">Set a new password</p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8 space-y-4">
          {done ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-[#333]">
                Your password has been updated. Please sign in with your new password.
              </p>
              <Button
                onClick={() => (window.location.hash = '#/login')}
                className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc]"
              >
                Go to Sign In
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>New password</Label>
                <Input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Confirm new password</Label>
                <Input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc]"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
