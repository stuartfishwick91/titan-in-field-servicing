import { cloudIdentity } from "../cloud/identity";
export type UserRole = "Administrator" | "Supervisor" | "Employee";
export type EmployeePortalRole = "Serviceperson" | "Fuel Operator" | "Fitter" | "Supervisor" | "Admin" | "Employee";
export type UserStatus = "Active" | "Inactive" | "On Leave";

export type ManagedUser = {
  id: string;
  fullName: string;
  employeeNumber: string;
  email: string;
  phone: string;
  crew: string;
  position: string;
  assignedServiceTruck: string;
  assignedServiceTruckId: string | null;
  employeeRole: EmployeePortalRole;
  permissions: string[];
  role: UserRole;
  pin: string;
  status: UserStatus;
  profilePicture: string;
  lastLogin: string;
  mustResetPin: boolean;
};

const USERS_STORAGE_KEY = "titan-managed-users-v1";
const CURRENT_USER_STORAGE_KEY = "titan-current-user-v1";

export const defaultUsers: ManagedUser[] = [
  {
    id: "user-admin",
    fullName: "Admin User",
    employeeNumber: "ADM-001",
    email: "admin@titansafety.test",
    phone: "0400 000 001",
    crew: "Management",
    position: "Administrator",
    assignedServiceTruck: "-",
    assignedServiceTruckId: null,
    employeeRole: "Admin",
    permissions: ["management"],
    role: "Administrator",
    pin: "1234",
    status: "Active",
    profilePicture: "",
    lastLogin: "06 Jul 2026 08:00",
    mustResetPin: false,
  },
  {
    id: "user-supervisor",
    fullName: "Alicia Brown",
    employeeNumber: "SUP-014",
    email: "alicia.brown@titansafety.test",
    phone: "0400 000 014",
    crew: "Crew A",
    position: "Supervisor",
    assignedServiceTruck: "ST102",
    assignedServiceTruckId: "ST102",
    employeeRole: "Supervisor",
    permissions: ["management", "fuel-schedule"],
    role: "Supervisor",
    pin: "2468",
    status: "Active",
    profilePicture: "",
    lastLogin: "06 Jul 2026 06:45",
    mustResetPin: false,
  },
  {
    id: "user-stuart",
    fullName: "Stuart Fishwick",
    employeeNumber: "EMP-083",
    email: "stuart.fishwick@titansafety.test",
    phone: "0400 000 083",
    crew: "Crew A",
    position: "Field Service Technician",
    assignedServiceTruck: "RD4830",
    assignedServiceTruckId: "RD4830",
    employeeRole: "Serviceperson",
    permissions: ["service-entry", "refills", "fuel-schedule", "daily-sheet"],
    role: "Employee",
    pin: "1234",
    status: "Active",
    profilePicture: "",
    lastLogin: "06 Jul 2026 05:55",
    mustResetPin: false,
  },
  {
    id: "user-mark",
    fullName: "Mark Chen",
    employeeNumber: "EMP-127",
    email: "mark.chen@titansafety.test",
    phone: "0400 000 127",
    crew: "Crew B",
    position: "Field Service Technician",
    assignedServiceTruck: "ST103",
    assignedServiceTruckId: null,
    employeeRole: "Fitter",
    permissions: ["service-entry", "refills", "daily-sheet"],
    role: "Employee",
    pin: "4321",
    status: "Active",
    profilePicture: "",
    lastLogin: "05 Jul 2026 17:28",
    mustResetPin: false,
  },
];

export const rolePermissions: Record<UserRole, string[]> = {
  Administrator: [
    "dashboard",
    "bulk-storage",
    "workshop-storage",
    "service-trucks",
    "live-fuel-status",
    "fleet-management",
    "employee-management",
    "reports",
    "branding",
    "system-settings",
  ],
  Supervisor: ["dashboard", "bulk-storage", "workshop-storage", "service-trucks", "live-fuel-status", "reports"],
  Employee: [],
};

export function loadUsers() {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as ManagedUser[]).map(normaliseUser) : defaultUsers;
  } catch {
    return defaultUsers;
  }
}

export function saveUsers(users: ManagedUser[]) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event("titan-users-updated"));
}

export function loadCurrentUser() {
  return cloudIdentity();
}

function normaliseUser(user: ManagedUser): ManagedUser {
  const roleMap: Record<UserRole, EmployeePortalRole> = {
    Administrator: "Admin",
    Supervisor: "Supervisor",
    Employee: "Employee",
  };
  const employeeRole = user.employeeRole ?? roleMap[user.role] ?? "Employee";
  return {
    ...user,
    employeeRole,
    assignedServiceTruckId: user.assignedServiceTruckId ?? (user.assignedServiceTruck && user.assignedServiceTruck !== "-" ? user.assignedServiceTruck : null),
    permissions: user.permissions ?? (employeeRole === "Serviceperson" || employeeRole === "Fuel Operator"
      ? ["service-entry", "refills", "fuel-schedule", "daily-sheet"]
      : ["service-entry", "refills", "daily-sheet"]),
  };
}

export function setCurrentUser(user: ManagedUser) {
  const next = { ...user, lastLogin: new Date().toLocaleString() };
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("titan-current-user-updated"));
  return next;
}

export function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  window.dispatchEvent(new Event("titan-cloud-signout"));
  window.dispatchEvent(new Event("titan-current-user-updated"));
}

export function canAccessManagementPath(role: UserRole, pathname: string) {
  const key = pathname.replace(/^\/management\/?/, "").split("/")[0] || "dashboard";
  return rolePermissions[role].includes(key);
}
