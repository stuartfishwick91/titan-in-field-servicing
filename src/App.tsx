import { Navigate, Route, Routes } from "react-router-dom";
import { EmployeePortal } from "./employee/EmployeePortal";
import { ManagementPortal } from "./management/ManagementPortal";
import { LiveFuelStatus } from "./management/screens/LiveFuelStatus";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/management/dashboard" replace />} />
      <Route path="/live-fuel-status-display" element={<LiveFuelStatus readOnly displayMode />} />
      <Route path="/management/*" element={<ManagementPortal />} />
      <Route path="/employee/*" element={<EmployeePortal />} />
    </Routes>
  );
}
