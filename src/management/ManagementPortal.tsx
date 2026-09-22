import { DisplayModeToggle } from "../ui/DisplayModeToggle";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Droplets,
  Fuel,
  Gauge,
  HardHat,
  Settings,
  Truck,
  Users,
  UserRound,
  Wrench,
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useBranding } from "../branding/BrandingContext";
import { canAccessManagementPath, clearCurrentUser, loadCurrentUser, loadUsers, rolePermissions, setCurrentUser, type ManagedUser } from "../data/userAccessStore";
import { LoginScreen } from "../branding/LoginScreen";
import { Dashboard } from "./screens/Dashboard";
import { SiteOilStorage } from "./screens/SiteOilStorage";
import { LiveFuelStatus } from "./screens/LiveFuelStatus";
import {
  Branding,
  BulkStorage,
  EmployeeManagement,
  FleetManagement,
  Reports,
  ServiceTrucks,
  SystemSettings,
  WorkshopStorage,
} from "./screens/ManagementModules";

const navGroups = [
  {
    title: "",
    items: [{ to: "/management/dashboard", label: "Dashboard", icon: Gauge }],
  },
  {
    title: "Operations",
    items: [
      { to: "/management/bulk-storage", label: "Bulk Storage", icon: Droplets },
      { to: "/management/workshop-storage", label: "Workshop Storage", icon: Wrench },
      { to: "/management/field-storage", label: "Field Storage", icon: Droplets },
      { to: "/management/service-trucks", label: "Service Trucks", icon: Truck },
      { to: "/management/live-fuel-status", label: "Live Fuel Status", icon: Fuel },
    ],
  },
  {
    title: "Management",
    items: [
      { to: "/management/fleet-management", label: "Asset Management", icon: HardHat },
      { to: "/management/employee-management", label: "Employee Management", icon: Users },
      { to: "/management/reports", label: "Reports", icon: ClipboardList },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/management/branding", label: "Branding", icon: Building2 },
      { to: "/management/system-settings", label: "System Settings", icon: Settings },
      { to: "/employee", label: "Log Out", icon: LogOut },
    ],
  },
];

export function ManagementPortal() {
  const location = useLocation();
  const { branding } = useBranding();
  const [currentUser, setCurrentUserState] = useState<ManagedUser | null>(loadCurrentUser);
  const usesOriginalHeader =
    location.pathname === "/management/dashboard" ||
    location.pathname === "/management/bulk-storage" ||
    location.pathname === "/management/field-storage" ||
    location.pathname === "/management/service-trucks";

  const portalOverlay = branding.portalBackground
    ? `linear-gradient(rgba(8, 13, 19, ${1 - branding.portalBackgroundOpacity / 100}), rgba(8, 13, 19, ${1 - branding.portalBackgroundOpacity / 100})), url(${branding.portalBackground})`
    : undefined;
  const currentPathKey = location.pathname.replace(/^\/management\/?/, "").split("/")[0] || "dashboard";
  const isAllowed = currentUser ? canAccessManagementPath(currentUser.role, location.pathname) : false;
  const filteredNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.to === "/employee") return true;
        const key = item.to.replace(/^\/management\/?/, "");
        return currentUser ? rolePermissions[currentUser.role].includes(key) : false;
      }),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const refresh = () => setCurrentUserState(loadCurrentUser());
    window.addEventListener("storage", refresh);
    window.addEventListener("titan-current-user-updated", refresh);
    window.addEventListener("titan-users-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("titan-current-user-updated", refresh);
      window.removeEventListener("titan-users-updated", refresh);
    };
  }, []);

  if (!currentUser) {
    return <ManagementLogin onLogin={setCurrentUserState} />;
  }

  return (
    <div className="management-shell">
      <aside className="sidebar">
        <div className="sidebar-company-logo">
          <img src={branding.logo || `${import.meta.env.BASE_URL}branding/titan-wordmark.png`} alt={branding.companyName} />
        </div>
        <DisplayModeToggle />
        <nav className="nav-stack">
          {filteredNavGroups.map((group) => (
            <section key={group.title}>
              {group.title && <h2>{group.title}</h2>}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={item.to === "/employee" ? () => clearCurrentUser() : undefined}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </section>
          ))}
        </nav>
        <div
          className="sidebar-hero-preview"
          style={branding.sidebarImage ? { backgroundImage: `linear-gradient(180deg, #0b1118 0%, rgba(11,17,24,.64) 16%, rgba(11,17,24,.12) 34%, rgba(8,13,19,.9) 100%), url(${branding.sidebarImage})` } : undefined}
        >
          <strong>IN-FIELD SERVICING</strong>
          <span>SAFE. TRACKED. RELIABLE.</span>
        </div>
      </aside>
      <main className="content" style={portalOverlay ? { backgroundImage: portalOverlay, backgroundSize: "cover", backgroundAttachment: "fixed" } : undefined}>
        {!usesOriginalHeader && (
          <header className="topbar">
            <div>
              <p>Management Portal</p>
              <h1>Mining field servicing control room</h1>
            </div>
          </header>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/management/dashboard" replace />} />
          {currentUser.role === "Employee" || !isAllowed ? (
            <Route path="*" element={<AccessDenied requested={currentPathKey} />} />
          ) : (
            <>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="live-fuel-status" element={<LiveFuelStatus />} />
              <Route path="bulk-storage" element={<SiteOilStorage key="site" />} />
              <Route path="field-storage" element={<WorkshopStorage key="field" department="Field" />} />
              <Route path="bulk-tanks" element={<BulkStorage />} />
              <Route path="workshop-storage" element={<WorkshopStorage key="workshop" />} />
              <Route path="service-trucks" element={<ServiceTrucks />} />
              <Route path="fleet-management" element={<FleetManagement />} />
              <Route path="employee-management" element={<section className="panel"><h1>Trial account</h1><p>This presentation uses the same administrator email on both devices. Separate employee logins and permissions are not enabled in this trial.</p><p>Manage the app password in Supabase Authentication → Users. Prototype PIN accounts do not grant access to shared records.</p></section>} />
              <Route path="reports" element={<Reports />} />
              <Route path="branding" element={<Branding />} />
              <Route path="system-settings" element={<SystemSettings />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/management/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function ManagementLogin({ onLogin }: { onLogin: (user: ManagedUser) => void }) {
  const [error, setError] = useState("");

  function submit(fullName: string, pin: string) {
    const user = loadUsers().find((item) => item.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() && item.pin === pin);
    if (!user) {
      setError("Full Name or PIN is not recognised.");
      return;
    }
    if (user.status !== "Active") {
      setError("This user is disabled or not currently active.");
      return;
    }
    if (user.role !== "Administrator" && user.role !== "Supervisor") {
      setError("This login does not have Management Portal access.");
      return;
    }
    const loggedInUser = setCurrentUser(user);
    setError("");
    onLogin(loggedInUser);
  }

  return <LoginScreen onLogin={submit} error={error} management />;
}

function AccessDenied({ requested }: { requested: string }) {
  return (
    <section className="access-denied-panel">
      <UserRound size={34} />
      <h1>Access Denied</h1>
      <p>You do not have permission to access this portal.</p>
      <small>Requested module: {requested || "management"}</small>
      <NavLink to="/employee" className="primary-button">Employee Portal</NavLink>
    </section>
  );
}
