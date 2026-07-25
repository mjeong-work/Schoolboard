import React, { useEffect, useState } from 'react';
import { useAuth } from './utils/authContext';
import { Button } from './components/ui/button';
import { Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export default function VerificationPendingPage() {
  const { user, logout, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // If user is approved, redirect to community
    if (user?.status === 'approved') {
      window.location.hash = '#/community';
    }
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  const handleLogout = () => {
    logout();
    window.location.hash = '#/login';
  };

  if (!user) {
    return null;
  }

  if (user.status === 'rejected') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-8">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <h2 className="text-[#111] mb-4">Application Rejected</h2>

            <p className="text-[#666] mb-6">
              Unfortunately, your application to join Campus Connect has been rejected. This may be due to:
            </p>

            <ul className="text-left text-sm text-[#666] space-y-2 mb-6">
              <li className="flex items-start gap-2">
                <span className="text-[#999]">•</span>
                <span>Email domain not recognized as a verified campus email</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#999]">•</span>
                <span>Information provided could not be verified</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#999]">•</span>
                <span>Account flagged for policy violations</span>
              </li>
            </ul>

            <p className="text-sm text-[#666] mb-6">
              If you believe this is a mistake, please contact support at{' '}
              <a href="mailto:support@campusconnect.edu" className="text-[#0b5fff] hover:underline">
                support@campusconnect.edu
              </a>
            </p>

            <Button onClick={handleLogout} className="w-full bg-[#0b5fff] hover:bg-[#0a4ecc]">
              Return to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white border border-[#e5e5e5] rounded-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-[#0b5fff]" />
            </div>
          </div>

          <h2 className="text-[#111] mb-4">Verification Pending</h2>

          <p className="text-[#666] mb-6">
            Thank you for registering, <span className="text-[#111]">{user.name}</span>! Your account is currently
            under review.
          </p>

          <div className="bg-[#f5f5f5] rounded-lg p-4 mb-6 space-y-2 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-[#666]">Email:</span>
              <span className="text-[#333]">{user.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666]">Role:</span>
              <span className="text-[#333]">{user.role}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666]">Department:</span>
              <span className="text-[#333]">{user.department}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666]">Status:</span>
              <span className="text-yellow-600">Pending Review</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 text-[#333] px-4 py-3 rounded-lg text-sm mb-6">
            <p className="mb-2">
              <span className="text-[#111]">What happens next?</span>
            </p>
            <ul className="text-left space-y-1 text-xs">
              <li>• Our admin team will verify your campus email</li>
              <li>• We'll check your information against university records</li>
              <li>• You'll receive approval within 24-48 hours</li>
              <li>• Once approved, you'll have full access to Campus Connect</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              className="flex-1 border-[#e5e5e5]"
            >
              {refreshing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Status
                </>
              )}
            </Button>
            <Button onClick={handleLogout} variant="outline" className="flex-1 border-[#e5e5e5]">
              Sign Out
            </Button>
          </div>
        </div>

        <p className="text-xs text-[#999] mt-6">
          Need help?{' '}
          <a href="mailto:support@campusconnect.edu" className="text-[#0b5fff] hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
