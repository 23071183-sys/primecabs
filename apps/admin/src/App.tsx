import { Loader2, ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { EmptyState, ErrorState } from "./components/ui/Data";
import { useAuth } from "./lib/auth";
import type { Permission } from "./lib/types";
import { AuditPage } from "./pages/AuditPage";
import { BookingsPage } from "./pages/BookingsPage";
import { DriversPage } from "./pages/DriversPage";
import { LoginPage } from "./pages/LoginPage";
import { MoneyPage } from "./pages/MoneyPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlacesPage } from "./pages/PlacesPage";
import { RidesPage } from "./pages/RidesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StaffPage } from "./pages/StaffPage";

function Guard({ permission, children }: { permission?: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (permission && !can(permission)) {
    return <EmptyState icon={<ShieldOff className="size-5" />} title="Your role can't open this page" body="Ask a super admin if you need access." />;
  }
  return <>{children}</>;
}

function Protected() {
  const { admin, loading, bootError, retry } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400" role="status">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }
  if (!admin && bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState message={bootError} onRetry={retry} />
      </div>
    );
  }
  if (!admin) return <Navigate to="/login" replace />;
  return <Layout />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route index element={<OverviewPage />} />
          <Route path="drivers" element={<Guard permission="drivers.read"><DriversPage /></Guard>} />
          <Route path="rides" element={<Guard permission="rides.read"><RidesPage /></Guard>} />
          <Route path="bookings" element={<Guard permission="bookings.read"><BookingsPage /></Guard>} />
          <Route path="money" element={<Guard permission="payments.read"><MoneyPage /></Guard>} />
          <Route path="places" element={<Guard permission="config.read"><PlacesPage /></Guard>} />
          <Route path="settings" element={<Guard permission="config.read"><SettingsPage /></Guard>} />
          <Route path="staff" element={<Guard permission="admins.manage"><StaffPage /></Guard>} />
          <Route path="audit" element={<Guard permission="audit.read"><AuditPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
