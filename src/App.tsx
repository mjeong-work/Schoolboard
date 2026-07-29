import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./utils/authContext";
import { DataProvider } from "./utils/dataContext";
import { ChatProvider } from "./utils/chatContext";
import CommunityPage from "./CommunityPage";
import EventsPage from "./EventsPage";
import MarketplacePage from "./MarketplacePage";
import ProfilePage from "./ProfilePage";
import AdminPage from "./AdminPage";
import EditProfilePage from "./EditProfilePage";
import RegisterPage from "./RegisterPage";
import LoginPage from "./LoginPage";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";
import VerificationPendingPage from "./VerificationPendingPage";
import { MessagesPage } from "./components/MessagesPage";
import { ChatManager } from "./components/ChatManager";
import { Toaster } from "./components/ui/sonner";

type PageType =
  | "community"
  | "events"
  | "marketplace"
  | "profile"
  | "admin"
  | "edit-profile"
  | "messages"
  | "register"
  | "verification"
  | "login"
  | "forgot-password"
  | "reset-password";

function AppRouter() {
  const { user, isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageType>("login");
  // Sticky flag: recovering the password establishes a temporary session,
  // which flips isAuthenticated to true and would otherwise make the routing
  // below treat the visit as a normal login and bounce straight to the app
  // before the user gets to set a new password. Once set, this only clears
  // when the user explicitly leaves (e.g. "Go to Sign In" -> #/login).
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash;
      const hash = rawHash.slice(1).replace("/", "");
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

      // Check if user is authenticated
      if (!isAuthenticated) {
        setCurrentPage("login");
        window.location.hash = "#/login";
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
  }, [isAuthenticated, user, isRecovering]);

  // Render appropriate page
  if (currentPage === "login") {
    return <LoginPage />;
  }

  if (currentPage === "register") {
    return <RegisterPage />;
  }

  if (currentPage === "forgot-password") {
    return <ForgotPasswordPage />;
  }

  if (currentPage === "reset-password") {
    return <ResetPasswordPage />;
  }

  if (currentPage === "verification") {
    return <VerificationPendingPage />;
  }

  // Protected pages (only accessible when authenticated and approved)
  return (
    <>
      {currentPage === "community" && <CommunityPage />}
      {currentPage === "events" && <EventsPage />}
      {currentPage === "marketplace" && <MarketplacePage />}
      {currentPage === "profile" && <ProfilePage />}
      {currentPage === "admin" && <AdminPage />}
      {currentPage === "edit-profile" && <EditProfilePage />}
      {currentPage === "messages" && <MessagesPage />}
      <ChatManager />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <ChatProvider>
          <AppRouter />
          <Toaster position="top-center" />
        </ChatProvider>
      </DataProvider>
    </AuthProvider>
  );
}
