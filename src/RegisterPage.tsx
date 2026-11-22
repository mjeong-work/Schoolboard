import React, { useState } from 'react';
import { useAuth } from './utils/authContext';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { isSchoolEmail } from './utils/schoolEmail';

export default function RegisterPage() {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    department: '',
    graduationYear: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!/^[a-zA-Z0-9]{4,}$/.test(formData.username)) {
      setError('Username must be at least 4 characters and contain only letters and numbers');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!formData.role) {
      setError('Please select your role');
      return;
    }

    if (!formData.department) {
      setError('Please select your department');
      return;
    }

    setLoading(true);

    const result = await register({
      name: formData.name,
      username: formData.username,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      department: formData.department,
      graduationYear: formData.graduationYear || undefined,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.message);
    } else if (result.needsVerification) {
      window.location.hash = '#/verify-email';
    } else {
      // "Confirm email" disabled in Supabase: session exists immediately,
      // fall back to the status-based routing.
      window.location.hash = '#/verification';
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-[#111] mb-2">Campus Connect</h1>
          <p className="text-[#666]">Join your campus community</p>
        </div>

        {/* Register Form */}
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8">
          <div className="flex items-center gap-2 mb-6">
            <UserPlus className="w-5 h-5 text-[#0b5fff]" />
            <h2 className="text-[#111]">Create Account</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => updateFormData('name', e.target.value)}
                required
              />
            </div>

            {/* Username */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="e.g. johndo3"
                value={formData.username}
                onChange={(e) => updateFormData('username', e.target.value)}
                required
              />
              <p className="text-xs text-[#666]">Letters and numbers only, min 4 characters. This is your login ID and cannot be changed.</p>
            </div>

            {/* School Email */}
            <div className="space-y-2">
              <Label htmlFor="email">School Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@university.edu"
                value={formData.email}
                onChange={(e) => updateFormData('email', e.target.value)}
                required
              />
              <p className="text-xs text-[#666]">We'll send a verification code to this address. Not shown to other users.</p>
              {formData.email.includes('@') && formData.email.split('@')[1]?.includes('.') && (
                isSchoolEmail(formData.email) ? (
                  <p className="text-xs text-green-600">
                    School email detected — your account activates as soon as you enter the code.
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Not a recognized school domain — after verifying the code, your account will also need admin approval.
                  </p>
                )
              )}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={formData.role} onValueChange={(value) => updateFormData('role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Current Student">Current Student</SelectItem>
                  <SelectItem value="Alumni">Alumni</SelectItem>
                  <SelectItem value="Faculty">Faculty</SelectItem>
                  <SelectItem value="Staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label htmlFor="department">Department/Major</Label>
              <Select value={formData.department} onValueChange={(value) => updateFormData('department', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Computer Science">Computer Science</SelectItem>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Arts & Humanities">Arts & Humanities</SelectItem>
                  <SelectItem value="Sciences">Sciences</SelectItem>
                  <SelectItem value="Social Sciences">Social Sciences</SelectItem>
                  <SelectItem value="Medicine">Medicine</SelectItem>
                  <SelectItem value="Law">Law</SelectItem>
                  <SelectItem value="Education">Education</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Graduation Year (Optional) */}
            {(formData.role === 'Current Student' || formData.role === 'Alumni') && (
              <div className="space-y-2">
                <Label htmlFor="graduationYear">
                  {formData.role === 'Alumni' ? 'Graduation Year' : 'Expected Graduation Year'}
                </Label>
                <Input
                  id="graduationYear"
                  type="text"
                  placeholder="2025"
                  value={formData.graduationYear}
                  onChange={(e) => updateFormData('graduationYear', e.target.value)}
                />
              </div>
            )}

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChange={(e) => updateFormData('password', e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#333]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => updateFormData('confirmPassword', e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc]">
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#666]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => (window.location.hash = '#/login')}
                className="text-[#0b5fff] hover:underline"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#999] mt-8">
          By creating an account, you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#0b5fff]">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#0b5fff]">
            Privacy Policy
          </a>
        </p>
        <p className="text-center text-xs text-[#999] mt-2 space-x-3">
          <a href="/community-guidelines" target="_blank" rel="noopener noreferrer" className="hover:text-[#0b5fff] hover:underline">
            Community Guidelines
          </a>
          <a href="/child-safety" target="_blank" rel="noopener noreferrer" className="hover:text-[#0b5fff] hover:underline">
            Child Safety Standards
          </a>
        </p>
      </div>
    </div>
  );
}
