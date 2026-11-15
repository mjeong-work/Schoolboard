import React, { useState } from 'react';
import { useAuth } from './utils/authContext';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) {
      if (result.needsVerification) {
        window.location.hash = '#/verify-email';
        return;
      }
      setError(result.message);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-[#111] mb-2">Campus Connect</h1>
          <p className="text-[#666]">Sign in to your account</p>
        </div>

        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8 space-y-4">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc]"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>

          <div className="text-center space-y-2">
            <p className="text-sm text-[#666]">
              Don't have an account?{' '}
              <button
                onClick={() => (window.location.hash = '#/register')}
                className="text-[#0b5fff] hover:underline"
              >
                Register
              </button>
            </p>
            <p className="text-sm">
              <button
                onClick={() => (window.location.hash = '#/forgot-password')}
                className="text-[#666] hover:text-[#0b5fff] hover:underline"
              >
                Forgot password?
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
