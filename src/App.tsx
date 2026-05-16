import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ProtectedRoute, RoleRoute } from "@/components/auth/ProtectedRoute";

import Landing from "@/pages/public/Landing";
import Browse from "@/pages/public/Browse";
import PropertyDetail from "@/pages/public/PropertyDetail";
import Login from "@/pages/public/Login";
import Signup from "@/pages/public/Signup";
import ResetPassword from "@/pages/public/ResetPassword";
import NotFound from "@/pages/public/NotFound";

import TenantDashboard from "@/pages/tenant/Dashboard";
import TenantFavorites from "@/pages/tenant/Favorites";
import TenantApplications from "@/pages/tenant/Applications";
import TenantLease from "@/pages/tenant/Lease";
import TenantMaintenance from "@/pages/tenant/Maintenance";
import TenantPayments from "@/pages/tenant/Payments";

import LandlordDashboard from "@/pages/landlord/Dashboard";
import LandlordListings from "@/pages/landlord/Listings";
import LandlordListingForm from "@/pages/landlord/ListingForm";
import LandlordApplications from "@/pages/landlord/Applications";
import LandlordTenants from "@/pages/landlord/Tenants";
import LandlordLeases from "@/pages/landlord/Leases";
import LandlordMaintenance from "@/pages/landlord/Maintenance";
import LandlordPayments from "@/pages/landlord/Payments";

import MaintenanceDashboard from "@/pages/maintenance/Dashboard";
import MaintenanceProfile from "@/pages/maintenance/Profile";

import AdminDashboard from "@/pages/admin/Dashboard";
import AdminUsers from "@/pages/admin/Users";
import AdminListings from "@/pages/admin/Listings";
import AdminComplaints from "@/pages/admin/Complaints";

import Messages from "@/pages/shared/Messages";
import Notifications from "@/pages/shared/Notifications";
import Settings from "@/pages/shared/Settings";

function RoleRedirect() {
  const { role, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!role) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/app/admin" replace />;
  return <Navigate to={`/app/${role}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/properties/:id" element={<PropertyDetail />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRedirect />} />

        <Route path="tenant" element={<RoleRoute role="tenant"><TenantDashboard /></RoleRoute>} />
        <Route path="tenant/favorites" element={<RoleRoute role="tenant"><TenantFavorites /></RoleRoute>} />
        <Route path="tenant/applications" element={<RoleRoute role="tenant"><TenantApplications /></RoleRoute>} />
        <Route path="tenant/lease" element={<RoleRoute role="tenant"><TenantLease /></RoleRoute>} />
        <Route path="tenant/maintenance" element={<RoleRoute role="tenant"><TenantMaintenance /></RoleRoute>} />

        <Route path="landlord" element={<RoleRoute role="landlord"><LandlordDashboard /></RoleRoute>} />
        <Route path="landlord/listings" element={<RoleRoute role="landlord"><LandlordListings /></RoleRoute>} />
        <Route path="landlord/listings/new" element={<RoleRoute role="landlord"><LandlordListingForm /></RoleRoute>} />
        <Route path="landlord/listings/:id/edit" element={<RoleRoute role="landlord"><LandlordListingForm /></RoleRoute>} />
        <Route path="landlord/applications" element={<RoleRoute role="landlord"><LandlordApplications /></RoleRoute>} />
        <Route path="landlord/tenants" element={<RoleRoute role="landlord"><LandlordTenants /></RoleRoute>} />
        <Route path="landlord/leases" element={<RoleRoute role="landlord"><LandlordLeases /></RoleRoute>} />

        <Route path="maintenance" element={<RoleRoute role="maintenance"><MaintenanceDashboard /></RoleRoute>} />

        <Route path="admin" element={<RoleRoute role="admin"><AdminDashboard /></RoleRoute>} />
        <Route path="admin/users" element={<RoleRoute role="admin"><AdminUsers /></RoleRoute>} />
        <Route path="admin/listings" element={<RoleRoute role="admin"><AdminListings /></RoleRoute>} />
        <Route path="admin/complaints" element={<RoleRoute role="admin"><AdminComplaints /></RoleRoute>} />

        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
