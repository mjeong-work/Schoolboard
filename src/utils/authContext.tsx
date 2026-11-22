import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isStagingSchema } from './supabaseClient';

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  department: string;
  verified: boolean;
  status: 'pending' | 'approved' | 'rejected';
  avatar?: string;
  graduationYear?: string;
  bio?: string;
  joinDate?: string;
}

// Email awaiting OTP verification, handed from Register/Login to VerifyEmailPage.
export const PENDING_VERIFICATION_EMAIL_KEY = 'cc_pending_verification_email';

interface AuthContextType {
  user: User | null;
  currentUser: User | null;  // alias for user; consumed by chat/marketplace components
  isAuthenticated: boolean;
  /** False until the stored session (and its profile) has been checked on load. */
  authReady: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string; needsVerification?: boolean }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message: string; needsVerification?: boolean }>;
  verifyEmailCode: (email: string, code: string) => Promise<{ success: boolean; message: string }>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<{ error: { message: string } | null }>;
  refreshUser: () => Promise<void>;
}

export interface RegisterData {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  department: string;
  graduationYear?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Load user on mount
  useEffect(() => {
    // Get current session. Routing waits for authReady so a refresh on a
    // deep link (e.g. #/admin/reports) isn't bounced to the login page
    // while the stored session is still being restored.
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session) await fetchProfile(session.user.id);
      })
      .catch((err) => console.error('[auth] session restore failed', err))
      .finally(() => setAuthReady(true));

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const profileToUser = (data: Record<string, any>): User => ({
    id: data.id,
    name: data.name,
    email: data.email,
    username: data.username ?? '',
    role: data.role,
    department: data.department,
    verified: data.verified,
    status: data.status,
    avatar: data.avatar_url,
    graduationYear: data.graduation_year,
    bio: data.bio,
    joinDate: data.created_at,
  });

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setUser(profileToUser(data));
      return;
    }

    // PGRST116 = no rows found.
    // The DB trigger may not be installed yet, or email confirmation
    // delayed the insert. We have a valid session here (fetchProfile is
    // only called from onAuthStateChange when session != null), so the
    // RLS INSERT policy (auth.uid() = id) will pass.
    if (error?.code === 'PGRST116') {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const meta = authUser.user_metadata ?? {};
      const { error: insertError } = await supabase.from('profiles').insert({
        id: userId,
        name: meta.name ?? authUser.email?.split('@')[0] ?? '',
        email: authUser.email ?? '',
        username: meta.username ?? null,
        role: meta.role ?? 'Student',
        department: meta.department ?? '',
        graduation_year: meta.graduation_year ?? null,
        status: 'pending',
        verified: false,
      });

      if (insertError) {
        console.error('[fetchProfile] profile insert failed:', insertError.message);
        return;
      }

      const { data: created } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (created) setUser(profileToUser(created));
    }
  };

  const login = async (emailInput: string, password: string) => {
    // Sign in by email. The old username -> email lookup RPC let anyone
    // learn a member's email from their username, so it's no longer used.
    const email = emailInput.trim().toLowerCase();
    if (!email.includes('@')) {
      return { success: false, message: 'Sign in with your email address. Usernames are no longer used to sign in.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Supabase rejects password sign-in until the signup OTP is confirmed.
      if (error.message.toLowerCase().includes('email not confirmed')) {
        sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, email as string);
        return { success: false, needsVerification: true, message: 'Please verify your email to continue.' };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Login successful' };
  };

  const register = async (data: RegisterData) => {
    // Auth is shared with production even on the staging schema: a sign-up
    // here would create a real account (and a production profile row).
    if (isStagingSchema) {
      return { success: false, message: 'Sign-up is turned off in staging. Use the prepared test accounts.' };
    }
    // Pass profile fields via options.data so the DB trigger (handle_new_user)
    // can read them from raw_user_meta_data and insert the profile row itself.
    // This avoids the RLS violation that occurred when the frontend tried to
    // INSERT before a session existed (email-confirmation-enabled setups).
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          username: data.username,
          role: data.role,
          department: data.department,
          graduation_year: data.graduationYear ?? null,
        },
      },
    });

    if (authError) return { success: false, message: authError.message };
    if (!authData.user) return { success: false, message: 'Registration failed' };

    // With "Confirm email" enabled, signUp returns no session until the
    // emailed OTP is verified.
    if (!authData.session) {
      sessionStorage.setItem(PENDING_VERIFICATION_EMAIL_KEY, data.email);
      return { success: true, needsVerification: true, message: 'We sent a verification code to your email.' };
    }

    return { success: true, message: 'Registration successful!' };
  };

  const verifyEmailCode = async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    if (error) return { success: false, message: error.message };
    sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL_KEY);
    // A session now exists; onAuthStateChange fetches the profile.
    return { success: true, message: 'Email verified!' };
  };

  const resendVerificationCode = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'A new code has been sent.' };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const refreshUser = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) await fetchProfile(authUser.id);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return { error: { message: 'Not authenticated' } };

    const { error } = await supabase.from('profiles').update({
      name: updates.name,
      role: updates.role,
      department: updates.department,
      graduation_year: updates.graduationYear,
      bio: updates.bio,
      avatar_url: updates.avatar,
    }).eq('id', user.id);

    if (!error) {
      setUser({ ...user, ...updates });
    }
    return { error };
  };

  return (
    <AuthContext.Provider value={{ user, currentUser: user, isAuthenticated: !!user, authReady, login, register, verifyEmailCode, resendVerificationCode, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


// Helper functions for admin to manage users
export const approveUser = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved', verified: true })
    .eq('id', userId);
  return { error };
};

export const rejectUser = async (userId: string) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'rejected' })
    .eq('id', userId);
  return { error };
};

export const getPendingUsers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'pending');
  return data || [];
};
