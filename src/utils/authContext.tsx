import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

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

interface AuthContextType {
  user: User | null;
  currentUser: User | null;  // alias for user; consumed by chat/marketplace components
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
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

  // Load user on mount
  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) fetchProfile(session.user.id);
    });

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

  const login = async (username: string, password: string) => {
    // Look up email by username via RPC (runs as SECURITY DEFINER, no public table read needed)
    const { data: email, error: rpcError } = await supabase.rpc('get_email_by_username', { p_username: username });
    if (rpcError || !email) return { success: false, message: 'Username not found' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    return { success: true, message: 'Login successful' };
  };

  const register = async (data: RegisterData) => {
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

    return { success: true, message: 'Registration successful! Your account is pending approval.' };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

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
  };

  return (
    <AuthContext.Provider value={{ user, currentUser: user, isAuthenticated: !!user, login, register, logout, updateUser }}>
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
