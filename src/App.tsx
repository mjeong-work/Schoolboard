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

  useEffect(() => {
    const handleHashChange = () => {
      // Supabase password-recovery links redirect back with
      // "#access_token=...&type=recovery" tacked onto the URL (a URL can only
      // have one fragment, so this can't coexist with our own "#/reset-password"
      // hash route). Detect it directly instead of relying on hash routing.
      if (window.location.hash.includes("type=recovery")) {
        setCurrentPage("reset-password");
        return;
      }

      const hash = window.location.hash
        .slice(1)
        .replace("/", "");

      // Auth pages (accessible when not authenticated)
      if (hash === "register") {
        setCurrentPage("register");
        return;
      }

      if (hash === "forgot-password") {
        setCurrentPage("forgot-password");
        return;
      }

      // Password recovery links land here. Supabase auto-establishes a
      // temporary session from the recovery token, which would otherwise
      // make the checks below treat this as a normal authenticated visit.
      if (hash === "reset-password") {
        setCurrentPage("reset-password");
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
  }, [isAuthenticated, user]);

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
