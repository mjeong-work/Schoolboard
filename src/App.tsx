import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./utils/authContext";
import { DataProvider } from "./utils/dataContext";
import { ChatProvider } from "./utils/chatContext";
import LoginPage from "./LoginPage";
import { ChatManager } from "./components/ChatManager";
import { Toaster } from "./components/ui/sonner";
import { isSupabaseConfigured, isStagingSchema, dbSchema } from "./utils/supabaseClient";

// Route-level code splitting: everything below is only ever shown after
// the user lands on a specific page, so none of it needs to be in the
// initial bundle the browser fetches/parses before login can even render.
// LoginPage stays a static import since it's the one page rendered
// synchronously on first load for unauthenticated visitors.
const CommunityPage = lazy(() => import("./CommunityPage"));
const EventsPage = lazy(() => import("./EventsPage"));
const MarketplacePage = lazy(() => import("./MarketplacePage"));
const ProfilePage = lazy(() => import("./ProfilePage"));
const AdminPage = lazy(() => import("./AdminPage"));
const EditProfilePage = lazy(() => import("./EditProfilePage"));
const BlockedUsersPage = lazy(() => import("./BlockedUsersPage"));
const RegisterPage = lazy(() => import("./RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./ResetPasswordPage"));
const VerificationPendingPage = lazy(() => import("./VerificationPendingPage"));
const VerifyEmailPage = lazy(() => import("./VerifyEmailPage"));
const MessagesPage = lazy(() =>
  import("./components/MessagesPage").then((m) => ({ default: m.MessagesPage }))
);

// Minimal, theme-neutral placeholder — shown only for the brief moment a
// page chunk is fetched, never long enough to need real skeleton UI.
function PageLoadingFallback() {
  return <div className="min-h-screen bg-white" />;
}

type PageType =
  | "community"
  | "events"
  | "marketplace"
  | "profile"
  | "admin"
  | "edit-profile"
  | "blocked-users"
  | "messages"
  | "register"
  | "verify-email"
  | "verification"
  | "login"
  | "forgot-password"
  | "reset-password";

function AppRouter() {
  const { user, isAuthenticated, authReady } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageType>("login");
  // Sticky flag: recovering the password establishes a temporary session,
  // which flips isAuthenticated to true and would otherwise make the routing
  // below treat the visit as a normal login and bounce straight to the app
  // before the user gets to set a new password. Once set, this only clears
  // when the user explicitly leaves (e.g. "Go to Sign In" -> #/login).
  const [isRecovering, setIsRecovering] = useState(false);
  // Where a signed-out visit was headed, so it can continue there after login.
  const pendingRoute = useRef<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash;
      // "#/admin/reports" -> route "admin" (pages read their own sub-path).
      const fullPath = rawHash.slice(1).replace(/^\//, "");
      const hash = fullPath.split("/")[0];
      const recoveryArtifact = rawHash.includes("type=recovery");

      // Supabase clears the "#access_token=...&type=recovery" fragment via
      // history.replaceState once the session is established, leaving an
      // empty hash. Treat that empty hash as "still recovering" too, so the
      // page doesn't flip away the instant isAuthenticated turns true (from
      // the temporary recovery session) but before the user set a password.
      // Any *explicit* navigation (login, forgot-password, ...) still wins.
      if ((isRecovering || recoveryArtifact) && (hash === "" || recoveryArtifact)) {
        if (!isRecovering) setIsRecovering(true);
        setCurrentPage("reset-password");
        return;
      }
      if (isRecovering) {
        setIsRecovering(false);
      }

      // Auth pages (accessible when not authenticated)
      if (hash === "register") {
        setCurrentPage("register");
        return;
      }

      if (hash === "forgot-password") {
        setCurrentPage("forgot-password");
        return;
      }

      if (hash === "verify-email") {
        setCurrentPage("verify-email");
        return;
      }

      // Session still being restored: don't redirect yet, or every
      // refresh/bookmark would be rewritten to #/login and then land on
      // Community once the session arrives.
      if (!authReady) return;

      // Check if user is authenticated
      if (!isAuthenticated) {
        if (hash && hash !== "login" && hash !== "community") pendingRoute.current = fullPath;
        setCurrentPage("login");
        window.location.hash = "#/login";
        return;
      }

      // Just signed in from a redirect: continue to where the visit was headed.
      if (hash === "login" && pendingRoute.current) {
        const target = pendingRoute.current;
        pendingRoute.current = null;
        window.location.hash = `#/${target}`;
        return;
      }

      // Check if user is pending verification
      if (user?.status === "pending") {
        setCurrentPage("verification");
        if (hash !== "verification") {
          window.location.hash = "#/verification";
        }
        return;
      }

      // Check if user is rejected
      if (user?.status === "rejected") {
        setCurrentPage("verification");
        window.location.hash = "#/verification";
        return;
      }

      // Approved users can access main app pages
      if (hash === "events") {
        setCurrentPage("events");
      } else if (hash === "marketplace") {
        setCurrentPage("marketplace");
      } else if (hash === "profile") {
        setCurrentPage("profile");
      } else if (hash === "admin") {
        if (user?.role === 'Administrator') {
          setCurrentPage("admin");
        } else {
          setCurrentPage("community");
          window.location.hash = "#community";
        }
      } else if (hash === "edit-profile") {
        setCurrentPage("edit-profile");
      } else if (hash === "blocked-users") {
        setCurrentPage("blocked-users");
      } else if (hash === "messages") {
        setCurrentPage("messages");
      } else if (hash === "verification") {
        setCurrentPage("verification");
      } else {
        setCurrentPage("community");
        if (hash !== "community") {
          window.location.hash = "#/community";
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    return () =>
      window.removeEventListener("hashchange", handleHashChange);
  }, [isAuthenticated, authReady, user, isRecovering]);

  // Render appropriate page
  if (currentPage === "login") {
    // Neutral screen while a stored session is restored, instead of a
    // flash of the login form for people who are already signed in.
    return authReady ? <LoginPage /> : <PageLoadingFallback />;
  }

  if (currentPage === "register") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <RegisterPage />
      </Suspense>
    );
  }

  if (currentPage === "forgot-password") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ForgotPasswordPage />
      </Suspense>
    );
  }

  if (currentPage === "verify-email") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VerifyEmailPage />
      </Suspense>
    );
  }

  if (currentPage === "reset-password") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ResetPasswordPage />
      </Suspense>
    );
  }

  if (currentPage === "verification") {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <VerificationPendingPage />
      </Suspense>
    );
  }

  // Protected pages (only accessible when authenticated and approved)
  return (
    <>
      <Suspense fallback={<PageLoadingFallback />}>
        {currentPage === "community" && <CommunityPage />}
        {currentPage === "events" && <EventsPage />}
        {currentPage === "marketplace" && <MarketplacePage />}
        {currentPage === "profile" && <ProfilePage />}
        {currentPage === "admin" && <AdminPage />}
        {currentPage === "edit-profile" && <EditProfilePage />}
        {currentPage === "blocked-users" && <BlockedUsersPage />}
        {currentPage === "messages" && <MessagesPage />}
      </Suspense>
      <ChatManager />
    </>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6 font-[Roboto]">
        <div className="max-w-md w-full border border-[#e5e7eb] rounded-lg p-6">
          <h1 className="text-xl font-semibold text-[#111] mb-2">Supabase setup required</h1>
          <p className="text-sm text-[#666] leading-relaxed mb-4">
            Add your Supabase project values to a local .env file, then restart the dev server.
          </p>
          <pre className="bg-[#f5f5f5] text-[#111] text-xs rounded-md p-3 overflow-x-auto">
{`VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <DataProvider>
        <ChatProvider>
          <AppRouter />
          {isStagingSchema && (
            // Always visible so staging is never mistaken for the live site.
            <div
              role="status"
              className="fixed z-[70] bottom-20 right-3 sm:bottom-3 pointer-events-none rounded-full bg-[#f59e0b] text-[#111] text-xs font-semibold px-3 py-1 shadow font-[Roboto]"
            >
              STAGING · schema "{dbSchema}" · test data only
            </div>
          )}
          <Toaster position="top-center" />
        </ChatProvider>
      </DataProvider>
    </AuthProvider>
  );
}
