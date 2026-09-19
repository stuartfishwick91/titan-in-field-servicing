import { workAreas, workAreaTabs, areaOilSource, prepareAreaUsage, type WorkArea } from "../data/employeeWorkArea";
import { loadFacilities, loadSiteStock, saveSiteStock } from "../data/siteInventory";
import { applyStockOperation } from "../data/siteInventoryModel";
import { AlertTriangle, ClipboardCheck, Eye, Fuel, Home, QrCode, Send, Truck, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoginScreen } from "../branding/LoginScreen";
import { LocalBackupButton } from "../data/LocalBackupButton";
import { FuelFarmEntryTab } from "./FuelFarmEntryTab";
import { AssetQrScanner } from "./AssetQrScanner";
import { resolveAssetQr } from "../data/assetQr";
import { useBranding } from "../branding/BrandingContext";
import { loadFuelSubmissions, saveFuelSubmissions } from "../data/fuelSubmissionStore";
import { loadServiceTrucks, saveServiceTrucks, type ServiceTruckOilGroup } from "../data/serviceTruckStore";
import { loadBulkTanks, productIdForName, saveBulkTanks } from "../data/bulkTankStore";
import { loadWorkshopStock, saveWorkshopStock } from "../data/workshopStore";
import { clearCurrentUser, loadCurrentUser, loadUsers, setCurrentUser, type ManagedUser } from "../data/userAccessStore";
import { loadAssets, type EditableAsset } from "../data/assetStore";
import { loadServiceEntries, saveServiceEntries, type ServiceEntryRecord } from "../data/serviceEntryStore";
import { loadFuelSchedule, recordScheduledFuelUp, scheduleLabel, statusFromWindow, type FuelScheduleEntry } from "../data/fuelScheduleStore";
import { loadSystemAlertSettings } from "../data/systemSettingsStore";

type Tab = "home" | "service" | "refills" | "fuelSchedule" | "daily" | "fuelFarm";

const baseTabs: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "service", label: "Service Entry", icon: Wrench },
  { id: "fuelFarm", label: "Fuel Entry", icon: Fuel },
  { id: "refills", label: "Refills", icon: Fuel },
  { id: "daily", label: "Daily Sheet", icon: ClipboardCheck },
];

function hasFuelScheduleAccess(user: ManagedUser | null) {
  return user?.employeeRole === "Serviceperson" || user?.employeeRole === "Fuel Operator";
}

function tabsForUser(user: ManagedUser | null, area: WorkArea) {
  const available = [...baseTabs, { id: "fuelSchedule" as Tab, label: "Fuel Schedule", icon: Truck }];
  return workAreaTabs(area, hasFuelScheduleAccess(user)).map(id => available.find(item => item.id === id)!);
}

function currentFuelShift() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? "Day Shift" as const : "Night Shift" as const;
}

function currentReportDate() {
  return new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function EmployeePortal() {
  const { branding } = useBranding();

  const navigate = useNavigate();
  const [employee, setEmployee] = useState<string | null>(() => loadCurrentUser()?.fullName ?? null);
  const [employeeUser, setEmployeeUser] = useState<ManagedUser | null>(loadCurrentUser);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [notice, setNotice] = useState("");
  const [workArea, setWorkArea] = useState<WorkArea>(() => { const saved = localStorage.getItem("titan-employee-work-area"); return workAreas.includes(saved as WorkArea) ? saved as WorkArea : "Service Truck"; });
  const dirty = useRef(false);
  useEffect(() => { const mark = () => { dirty.current = true; }; window.addEventListener("titan-cloud-form-edited", mark); return () => window.removeEventListener("titan-cloud-form-edited", mark); }, []);
  function changeTab(next: Tab) {
    if (next === tab) return;
    if (dirty.current && !confirm("Discard your unsaved entry and change pages? Cancel to finish the entry first.")) return;
    dirty.current = false; window.dispatchEvent(new Event("titan-cloud-form-discarded")); setTab(next);
  }
  function changeWorkArea(next: WorkArea) {
    if (dirty.current && !confirm("Discard your unsaved entry and change work area?")) return;
    dirty.current = false; localStorage.setItem("titan-employee-work-area", next); setWorkArea(next); setTab("home");
  }
  const workingFrom = workArea === "Service Truck" ? localStorage.getItem("titan-employee-assigned-truck") ?? employeeUser?.assignedServiceTruckId ?? "Select a service truck on Home" : workArea;

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function signIn(fullName: string, pin: string) {
    const user = loadUsers().find((item) => item.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() && item.pin === pin);
    if (!user) {
      setError("Full Name or PIN is not recognised.");
      return;
    }
    if (user.status !== "Active") {
      setError("This user is disabled or not currently active.");
      return;
    }

    const loggedInUser = setCurrentUser(user);
    setError("");
    if (loggedInUser.role === "Administrator" || loggedInUser.role === "Supervisor") {
      navigate("/management/dashboard");
      return;
    }
    setEmployee(loggedInUser.fullName);
    setEmployeeUser(loggedInUser);
    const assignedTruckId = loggedInUser.assignedServiceTruckId ?? (loggedInUser.assignedServiceTruck !== "-" ? loggedInUser.assignedServiceTruck : "");
    if (assignedTruckId) localStorage.setItem("titan-employee-assigned-truck", assignedTruckId);
    setTab("home");
  }

  if (!employee) {
    return <LoginScreen onLogin={signIn} error={error} />;
  }

  return (
    <main className="employee-shell">
      <header className="employee-header">
        <div>
          <span>{branding.companyName}</span>
          <h1>{employee}</h1>
        </div>
        <button type="button" onClick={() => { clearCurrentUser(); setEmployee(null); setEmployeeUser(null); }}>Sign out</button>
      </header>
      <section className="phone-surface" onChangeCapture={() => { if (tab === "service" || tab === "refills" || tab === "fuelFarm") dirty.current = true; }}>
        {tab !== "home" && <p className="auto-source-line">Working from: <strong>{workingFrom}</strong></p>}
        {notice && <p className="success-banner">{notice}</p>}
        {tab === "home" && employeeUser && <HomeTab employee={employee} user={employeeUser} workArea={workArea} onWorkArea={changeWorkArea} onNotice={setNotice} />}
        {tab === "service" && <ServiceEntryTab workArea={workArea} employee={employee} onSubmit={() => { dirty.current = false; setNotice("Service entry submitted to the shift sheet."); }} />}
        {tab === "fuelFarm" && <FuelFarmEntryTab employee={employee} onSaved={() => { dirty.current = false; }} />}
        {tab === "refills" && <RefillsTab workArea={workArea} onSubmit={() => { dirty.current = false; setNotice("Refill recorded successfully."); }} />}
        {tab === "fuelSchedule" && employeeUser && (
          hasFuelScheduleAccess(employeeUser)
            ? <EmployeeFuelScheduleTab user={employeeUser} />
            : <AccessDeniedTab />
        )}
        {tab === "daily" && <DailySheetTab employee={employee} onSend={() => setNotice("Daily fuel ups submitted successfully")} />}
      </section>
      <nav className="bottom-tabs" aria-label="Employee navigation" style={{ gridTemplateColumns: `repeat(${tabsForUser(employeeUser, workArea).length}, minmax(0, 1fr))` }}>
        {tabsForUser(employeeUser, workArea).map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)} type="button">
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function HomeTab({
  workArea, onWorkArea,
  employee,
  user,
  onNotice,
}: {
  workArea: WorkArea;
  onWorkArea: (area: WorkArea) => void;
  employee: string;
  user: ManagedUser;
  onNotice: (message: string) => void;
}) {
  const [messageRead, setMessageRead] = useState(localStorage.getItem("titan-supervisor-message-read") === "true");
  const [showTruckDetails, setShowTruckDetails] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [fuelEntries, setFuelEntries] = useState(loadFuelSubmissions);
  const [submittedAt, setSubmittedAt] = useState(localStorage.getItem("titan-daily-fuel-submitted-at") ?? "");
  const [trucks] = useState(loadServiceTrucks);
  const [selectedTruckId, setSelectedTruckId] = useState(localStorage.getItem("titan-employee-assigned-truck") ?? user.assignedServiceTruckId ?? "");
  const assignedTruck = trucks.find((truck) => truck.truckId === selectedTruckId);
  const employeeFuelEntries = fuelEntries.filter((entry) => entry.employee === employee);
  const serviceEntries = loadServiceEntries().filter((entry) => entry.employee === employee);
  const dailySubmitted = employeeFuelEntries.length > 0 && employeeFuelEntries.every((entry) => entry.submitted);
  const totalCapacity = assignedTruck?.oilGroups.reduce((sum, group) => sum + group.capacity, 0) ?? 0;
  const totalCurrent = assignedTruck?.oilGroups.reduce((sum, group) => sum + group.current, 0) ?? 0;
  const overall = totalCapacity ? Math.round((totalCurrent / totalCapacity) * 100) : 0;
  const serviceRole = hasFuelScheduleAccess(user);

  function markMessageRead() {
    setMessageRead(true);
    localStorage.setItem("titan-supervisor-message-read", "true");
  }

  function confirmDailySubmission() {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updated = fuelEntries.map((entry) => entry.employee === employee ? {
      ...entry,
      date: entry.date ?? currentReportDate(),
      shift: entry.shift ?? currentFuelShift(),
      submitted: true,
      locked: true,
      submittedAt: time,
    } : entry);
    setFuelEntries(updated);
    setSubmittedAt(time);
    localStorage.setItem("titan-daily-fuel-submitted-at", time);
    saveFuelSubmissions(updated);
    setShowSubmitConfirm(false);
    onNotice("Daily fuel ups submitted successfully");
  }

  function selectAssignedTruck(truckId: string) {
    setSelectedTruckId(truckId);
    localStorage.setItem("titan-employee-assigned-truck", truckId);
    window.dispatchEvent(new CustomEvent("titan-employee-assigned-truck-updated", { detail: truckId }));
    onNotice(`Assigned service truck set to ${truckId}`);
  }

  return (
    <div className="employee-tab employee-home" data-local-preference>
      <p className="eyebrow">{currentFuelShift()} — Presentation trial</p>
      <h2>Welcome, {employee.split(" ")[0]}</h2>
      <LocalBackupButton />
      <section className="employee-home-card supervisor-card">
        <div className="employee-card-head">
          <div>
            <strong>Example Notice</strong>
            <span>Presentation sample</span>
          </div>
          <em className={messageRead ? "priority-badge acknowledged" : "priority-badge warning"}>{messageRead ? "Acknowledged" : "Warning"}</em>
        </div>
        <p>Example only: a supervisor notice would appear here. Live supervisor messaging is not enabled in this trial.</p>
        {!messageRead && <button className="secondary-button" type="button" onClick={markMessageRead}>Mark as Read</button>}
      </section>

      <section className="employee-home-card"><h3>Work Area</h3><label>Where are you working?<select value={workArea} onChange={event => onWorkArea(event.target.value as WorkArea)}>{workAreas.map(area => <option key={area}>{area}</option>)}</select></label><p>The bottom navigation and stock source follow your selected area.</p></section>
      {workArea === "Service Truck" ? (
        <>
          <section className="employee-home-card assigned-truck-card">
            <div className="employee-card-head">
              <div>
                <strong>Assigned Service Truck</strong>
                <span>{assignedTruck?.truckId} - {assignedTruck?.registration}</span>
              </div>
              <em className="priority-badge acknowledged">{assignedTruck?.status}</em>
            </div>
            <label className="employee-truck-select">Truck employee is in
              <select value={assignedTruck?.truckId ?? ""} onChange={(event) => selectAssignedTruck(event.target.value)}>
                <option value="">Select your service truck</option>
                {trucks.map((truck) => <option key={truck.truckId}>{truck.truckId}</option>)}
              </select>
            </label>
            <div className="employee-truck-summary">
              <Truck size={34} />
              <div>
                <span>Overall Stock</span>
                <strong>{overall}%</strong>
              </div>
              <div>
                <span>Oil Groups</span>
                <strong>{assignedTruck?.oilGroups.length ?? 0}</strong>
              </div>
            </div>
            <span>Last Refill: {assignedTruck?.lastRefill}</span>
            <button className="secondary-button" type="button" onClick={() => setShowTruckDetails(true)}><Eye size={16} /> View Truck</button>
          </section>

        </>
      ) : (
        <section className="employee-home-card">
          <div className="employee-card-head">
            <div>
              <strong>Today's Activity</strong>
              <span>{user.employeeRole} view</span>
            </div>
            <em className="priority-badge acknowledged">{user.status}</em>
          </div>
          <div className="shift-status-grid">
            <article><span>Service Entries</span><strong>{serviceEntries.length}</strong></article>
            <article><span>Fuel Entries</span><strong>{employeeFuelEntries.length}</strong></article>
            <article><span>Crew</span><strong>{user.crew || "-"}</strong></article>
            <article><span>Position</span><strong>{user.position || "-"}</strong></article>
          </div>
        </section>
      )}

      <section className="employee-home-card">
        <div className="employee-card-head">
          <div>
            <strong>End of Shift Status</strong>
            <span>Daily handover progress</span>
          </div>
          <em className={dailySubmitted ? "priority-badge acknowledged" : "priority-badge warning"}>{dailySubmitted ? "Submitted" : "Not Submitted"}</em>
        </div>
        <div className="shift-status-grid">
          <article><span>Fuel Entries</span><strong>{employeeFuelEntries.length}</strong></article>
          <article><span>Service Entries</span><strong>{serviceEntries.length}</strong></article>
          <article><span>Daily Fuel Ups</span><strong>{dailySubmitted ? "Submitted" : "Not Submitted"}</strong></article>
        </div>
        {submittedAt && <span>Submitted at: {submittedAt}</span>}
        <button className="primary-button wide-button" type="button" disabled={dailySubmitted} onClick={() => setShowSubmitConfirm(true)}>
          <Send size={18} />
          {dailySubmitted ? "Daily Fuel Ups Submitted" : "Submit Daily Fuel Ups"}
        </button>
      </section>

      {showTruckDetails && (
        <section className="employee-modal-panel">
          <div className="employee-card-head">
            <div>
              <strong>{assignedTruck?.truckId} Compartments</strong>
              <span>{assignedTruck?.registration}</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setShowTruckDetails(false)}>Close</button>
          </div>
          {assignedTruck?.oilGroups.map((group) => {
            const percent = Math.round((group.current / group.capacity) * 100);
            return (
              <article className="truck-compartment-detail" key={group.name}>
                <div><strong>{group.name}</strong><span>{group.system}</span></div>
                <span>{group.current.toLocaleString()} L / {group.capacity.toLocaleString()} L</span>
                <span className="soft-progress"><i className={percent > 60 ? "green" : "yellow"} style={{ width: `${percent}%` }} /></span>
              </article>
            );
          })}
        </section>
      )}

      {showSubmitConfirm && (
        <section className="employee-modal-panel">
          <div className="employee-card-head">
            <div>
              <strong>Submit daily fuel ups for this shift?</strong>
              <span>Validation check</span>
            </div>
            <AlertTriangle size={22} />
          </div>
          <div className="validation-list">
            <span className="ok">Fuel Entries Completed</span>
            <span className="ok">Refills Completed</span>
            <span className="ok">Service Entries Completed</span>
            <span className="warn">2 assigned assets have not been fuelled: RD4922, EX2501</span>
            <strong>Ready to Submit</strong>
          </div>
          <div className="button-row">
            <button className="primary-button" type="button" onClick={confirmDailySubmission}>Submit Anyway</button>
            <button className="secondary-button" type="button" onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}

function employeeFuelStatus(entry: FuelScheduleEntry) {
  if (entry.status === "In Service") return "In Service";
  return entry.status === "Fuelled" ? "Fuelled" : "Not Fuelled";
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function EmployeeFuelScheduleTab({ user }: { user: ManagedUser }) {
  const [schedule, setSchedule] = useState(loadFuelSchedule);
  const [trucks] = useState(loadServiceTrucks);
  const [assignedTruckId, setAssignedTruckId] = useState(localStorage.getItem("titan-employee-assigned-truck") ?? user.assignedServiceTruckId ?? "");
  const assignedEntries = schedule
    .filter((entry) => entry.shift === "Day Shift")
    .filter((entry) => entry.assignedServiceTruckId === assignedTruckId)
    .map((entry) => ({ ...entry, status: statusFromWindow(entry) }));
  const grouped = assignedEntries.reduce<Record<string, FuelScheduleEntry[]>>((groups, entry) => {
    groups[entry.assetType] = [...(groups[entry.assetType] ?? []), entry];
    return groups;
  }, {});
  const fuelled = assignedEntries.filter((entry) => entry.status === "Fuelled").length;

  useEffect(() => {
    const refresh = () => {
      setSchedule(loadFuelSchedule());
      setAssignedTruckId(localStorage.getItem("titan-employee-assigned-truck") ?? user.assignedServiceTruckId ?? "");
    };
    const refreshTruck = (event: Event) => {
      const truckId = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : localStorage.getItem("titan-employee-assigned-truck") ?? user.assignedServiceTruckId ?? "";
      setAssignedTruckId(truckId);
      setSchedule(loadFuelSchedule());
    };
    window.addEventListener("titan-fuel-schedule-updated", refresh);
    window.addEventListener("titan-employee-assigned-truck-updated", refreshTruck);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("titan-fuel-schedule-updated", refresh);
      window.removeEventListener("titan-employee-assigned-truck-updated", refreshTruck);
      window.removeEventListener("storage", refresh);
    };
  }, [user.assignedServiceTruckId]);

  function selectScheduleTruck(truckId: string) {
    setAssignedTruckId(truckId);
    localStorage.setItem("titan-employee-assigned-truck", truckId);
    window.dispatchEvent(new CustomEvent("titan-employee-assigned-truck-updated", { detail: truckId }));
  }

  return (
    <div className="employee-tab employee-fuel-schedule">
      <p className="eyebrow">Day shift - {assignedTruckId || "No assigned truck"}</p>
      <h2>Fuel Schedule</h2>
      <label className="employee-truck-select">Service Truck Schedule
        <select value={assignedTruckId} disabled>
          {trucks.map((truck) => <option key={truck.truckId} value={truck.truckId}>{truck.truckId} - {truck.registration}</option>)}
        </select>
      </label>
      <section className="employee-home-card">
        <div className="employee-card-head">
          <div>
            <strong>Assigned Schedule</strong>
          <span>Only assets assigned to this truck and shift</span>
          </div>
          <em className="priority-badge acknowledged">{fuelled} / {assignedEntries.length} Fuelled</em>
        </div>
        <div className="shift-status-grid">
          <article><span>Total Assets</span><strong>{assignedEntries.length}</strong></article>
          <article><span>Fuelled</span><strong>{fuelled}</strong></article>
          <article><span>Not Fuelled</span><strong>{Math.max(0, assignedEntries.length - fuelled)}</strong></article>
          <article><span>Truck</span><strong>{assignedTruckId || "-"}</strong></article>
        </div>
      </section>
      {assignedEntries.length === 0 && (
        <section className="employee-home-card">
          <strong>No Fuel Schedule Assigned</strong>
          <p>This employee does not have a day-shift fuel schedule for the selected service truck.</p>
        </section>
      )}
      {Object.entries(grouped).map(([assetType, entries]) => (
        <section className="employee-home-card employee-schedule-group" key={assetType}>
          <div className="employee-card-head">
            <div>
              <strong>{assetType}</strong>
              <span>{entries.length} assets</span>
            </div>
          </div>
          <div className="employee-schedule-list">
            {entries.map((entry) => {
              const status = employeeFuelStatus(entry);
              return (
                <article className="employee-schedule-card" key={entry.id}>
                  <div>
                    <strong>{entry.assetNumber}</strong>
                    <span>{entry.make} {entry.model}</span>
                    <small>SMU {entry.smu.toLocaleString()} - {scheduleLabel(entry)}</small>
                  </div>
                  <em className={`fuel-status-badge ${statusClass(status)}`}>{status}</em>
                  <dl>
                    <div><dt>Fuel Source</dt><dd>{entry.assignedFuelSource}</dd></div>
                    <div><dt>Litres</dt><dd>{entry.litresAdded ? `${entry.litresAdded.toLocaleString()} L` : "-"}</dd></div>
                    <div><dt>Last Fuel</dt><dd>{entry.lastFuelTime}</dd></div>
                    <div><dt>Machine Status</dt><dd>{entry.status === "In Service" ? "In Service" : "Working"}</dd></div>
                    <div><dt>Priority</dt><dd>{entry.priority}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AccessDeniedTab() {
  return (
    <div className="employee-tab center-tab">
      <AlertTriangle size={58} />
      <h2>Access Denied</h2>
      <p>Fuel Schedule is only available to Serviceperson and Fuel Operator roles.</p>
    </div>
  );
}

function ScanTab({ onScan }: { onScan: () => void }) {
  return (
    <div className="employee-tab center-tab">
      <QrCode size={78} />
      <h2>Scan Asset</h2>
      <p>QR scanning will be connected in the production pass. Use Asset Number entry for now.</p>
      <input placeholder="Asset Number" defaultValue="RD4830" />
      <button className="primary-button wide-button" type="button" onClick={onScan}><QrCode size={18} /> Load Asset</button>
    </div>
  );
}

type OilSource = "Workshop Storage" | "Service Truck Storage" | "Bulk Storage" | "Field Storage";
type OilDraft = Record<string, { litres: number; source: OilSource; comments: string }>;

const lastSmuByAsset: Record<string, number> = {
  RD4830: 18420,
  EX2501: 12980,
  MD6310: 11230,
  "MD6310-01": 11230,
  WC2204: 9500,
  DZ6108: 15490,
  GR1412: 6438,
};

function ServiceEntryTab({ employee, workArea, onSubmit }: { employee: string; workArea: WorkArea; onSubmit: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [assets, setAssets] = useState(loadAssets);
  const [trucks, setTrucks] = useState(loadServiceTrucks);
  const [manualAsset, setManualAsset] = useState("");
  const [loadedAsset, setLoadedAsset] = useState<EditableAsset | null>(null);
  const [currentSmu, setCurrentSmu] = useState("");
  const [fuelAdded, setFuelAdded] = useState("");
  const [fuelSource, setFuelSource] = useState(workArea === "Service Truck" ? "Assigned Service Truck" : `${workArea} Storage`);
  const [oilSource, setOilSource] = useState<OilSource>(areaOilSource(workArea));
  const [oilDraft, setOilDraft] = useState<OilDraft>({});
  const [generalComments, setGeneralComments] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [assignedTruckId, setAssignedTruckId] = useState(localStorage.getItem("titan-employee-assigned-truck") ?? loadCurrentUser()?.assignedServiceTruckId ?? "");
  const assignedTruck = trucks.find((truck) => truck.truckId === assignedTruckId);
  const lastSmu = loadedAsset ? lastSmuByAsset[loadedAsset.assetNumber] ?? 0 : 0;
  const smuNumber = Number(currentSmu);
  const smuWarning = loadedAsset && currentSmu && Number.isFinite(smuNumber)
    ? smuNumber < lastSmu
      ? "Current SMU is lower than the last recorded SMU."
      : smuNumber - lastSmu > 1000
        ? "Current SMU is unusually higher than the last recorded SMU."
        : ""
    : "";

  useEffect(() => {
    const refreshAssets = () => {
      const nextAssets = loadAssets();
      setAssets(nextAssets);
      setLoadedAsset((current) => {
        if (!current) return current;
        return nextAssets.find((asset) => asset.assetNumber.toLowerCase() === current.assetNumber.toLowerCase()) ?? current;
      });
    };
    window.addEventListener("storage", refreshAssets);
    window.addEventListener("titan-assets-updated", refreshAssets);
    return () => {
      window.removeEventListener("storage", refreshAssets);
      window.removeEventListener("titan-assets-updated", refreshAssets);
    };
  }, []);

  useEffect(() => {
    const refreshServiceTrucks = () => {
      setTrucks(loadServiceTrucks());
      setAssignedTruckId(localStorage.getItem("titan-employee-assigned-truck") ?? loadCurrentUser()?.assignedServiceTruckId ?? "");
    };
    const refreshAssignedTruck = (event: Event) => {
      const truckId = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : localStorage.getItem("titan-employee-assigned-truck") ?? loadCurrentUser()?.assignedServiceTruckId ?? "";
      setAssignedTruckId(truckId);
      setTrucks(loadServiceTrucks());
    };
    window.addEventListener("storage", refreshServiceTrucks);
    window.addEventListener("titan-service-trucks-updated", refreshServiceTrucks);
    window.addEventListener("titan-employee-assigned-truck-updated", refreshAssignedTruck);
    return () => {
      window.removeEventListener("storage", refreshServiceTrucks);
      window.removeEventListener("titan-service-trucks-updated", refreshServiceTrucks);
      window.removeEventListener("titan-employee-assigned-truck-updated", refreshAssignedTruck);
    };
  }, []);

  function loadAsset(assetNumber: string) {
    const asset = loadAssets().find((item) => item.assetNumber.toLowerCase() === assetNumber.trim().toLowerCase());
    if (!asset) {
      setLocalMessage("Asset not found. Check the asset number and try again.");
      setLoadedAsset(null);
      return;
    }
    setLoadedAsset(asset);
    setManualAsset(asset.assetNumber);
    setCurrentSmu(String(lastSmuByAsset[asset.assetNumber] ?? ""));
    setOilDraft({});
    setGeneralComments("");
    setLocalMessage(`${asset.assetNumber} loaded.`);
  }

  function scanAsset() {
    setScanning(true);
  }

  function updateOil(id: string, patch: Partial<{ litres: number; source: OilSource; comments: string }>) {
    setOilDraft((current) => ({
      ...current,
      [id]: {
        litres: current[id]?.litres ?? 0,
        source: current[id]?.source ?? "Workshop Storage",
        comments: current[id]?.comments ?? "",
        ...patch,
      },
    }));
  }

  function submitServiceEntry() {
    if (!loadedAsset) {
      alert("Load an asset before submitting service entry.");
      return;
    }
    if (!currentSmu || !Number.isFinite(smuNumber) || smuNumber < 0) {
      alert("Current SMU is required and must be a number.");
      return;
    }
    const fuelLitres = Number(fuelAdded || 0);
    if (!Number.isFinite(fuelLitres) || fuelLitres < 0) {
      alert("Fuel litres must be a finite, non-negative number.");
      return;
    }
    if (Object.values(oilDraft).some((draft) => !Number.isFinite(draft.litres) || draft.litres < 0)) {
      alert("Oil litres must be finite, non-negative numbers."); return;
    }
    const oilEntries = loadedAsset.oilConfiguration
      .filter((oil) => oil.active)
      .map((oil) => ({ oil, draft: oilDraft[oil.id] }))
      .filter(({ draft }) => draft?.litres && draft.litres > 0);
    if (fuelLitres <= 0 && !oilEntries.length) {
      alert("Enter litres for fuel, oil, or coolant before submitting.");
      return;
    }
    const resolvedFuelSource = fuelSource === "Assigned Service Truck"
      ? assignedTruck?.truckId ?? assignedTruckId ?? fuelSource
      : fuelSource;

    let nextStock;
    try {
      nextStock = prepareAreaUsage(loadSiteStock(), workArea, assignedTruckId, [
        ...(fuelLitres > 0 ? [{ product: "diesel", litres: fuelLitres }] : []),
        ...oilEntries.map(({ oil, draft }) => ({ product: productIdForName(oil.product), litres: draft.litres })),
      ]);
    } catch (error) { alert(error instanceof Error ? error.message : "Check source stock."); return; }

    const serviceEntry: ServiceEntryRecord = {
      id: `service-${Date.now()}`,
      date: currentReportDate(),
      shift: currentFuelShift(),
      employee,
      assetNumber: loadedAsset.assetNumber,
      make: loadedAsset.make,
      model: loadedAsset.model,
      type: loadedAsset.type,
      smu: smuNumber,
      fuelAdded: fuelLitres,
      fuelSource: resolvedFuelSource,
      oils: oilEntries.map(({ oil, draft }) => ({
        compartment: oil.compartment,
        product: oil.product,
        capacity: oil.capacity,
        litres: draft.litres,
        source: oilSource,
        sourceLocation: workArea === "Service Truck" ? assignedTruckId : workArea,
        comments: draft.comments,
      })),
      comments: generalComments,
      submitted: false,
    };
    saveServiceEntries([serviceEntry, ...loadServiceEntries()]);

    if (fuelLitres > 0) {
      const fuelEntries = loadFuelSubmissions();
      saveFuelSubmissions([
        {
          id: `fuel-service-${Date.now()}`,
          date: currentReportDate(),
          shift: currentFuelShift(),
          employee,
          asset: loadedAsset.assetNumber,
          smu: smuNumber,
          litres: fuelLitres,
          fuelSource: resolvedFuelSource,
          submitted: false,
          locked: false,
        },
        ...fuelEntries,
      ]);
      recordScheduledFuelUp(loadedAsset.assetNumber, fuelLitres, employee, resolvedFuelSource, currentFuelShift(), smuNumber);

    }
    saveSiteStock(nextStock);

    setLoadedAsset(null);
    setManualAsset("");
    setCurrentSmu("");
    setFuelAdded("");
    setFuelSource(workArea === "Service Truck" ? "Assigned Service Truck" : `${workArea} Storage`);
    setOilSource(areaOilSource(workArea));
    setOilDraft({});
    setGeneralComments("");
    setLocalMessage("Service entry recorded successfully");
    onSubmit();
  }

  return (
    <div className="employee-form service-entry-redesign">
      <h2>Service Entry</h2>
      {localMessage && <p className="success-banner">{localMessage}</p>}
      <button className="primary-button wide-button scan-asset-button" type="button" onClick={scanAsset}><QrCode size={18} /> Scan QR Asset</button>
      {scanning && <AssetQrScanner onClose={() => setScanning(false)} onScan={payload => {
        const asset = resolveAssetQr(payload, loadAssets());
        loadAsset(asset.assetNumber);
        setScanning(false);
        window.dispatchEvent(new Event("titan-cloud-form-edited"));
      }} />}
      <div className="load-asset-row">
        <label>Asset Number<input value={manualAsset} onChange={(event) => setManualAsset(event.target.value)} placeholder="Enter asset number" /></label>
        <button className="secondary-button" type="button" onClick={() => loadAsset(manualAsset)}>Load Asset</button>
      </div>
      {loadedAsset && (
        <>
          <section className="service-asset-summary">
            <dl>
              <div><dt>Asset Number</dt><dd>{loadedAsset.assetNumber}</dd></div>
              <div><dt>Make</dt><dd>{loadedAsset.make}</dd></div>
              <div><dt>Model</dt><dd>{loadedAsset.model}</dd></div>
              <div><dt>Type</dt><dd>{loadedAsset.type}</dd></div>
              <div><dt>Status</dt><dd>{loadedAsset.status}</dd></div>
              <div><dt>Last SMU</dt><dd>{lastSmu.toLocaleString()}</dd></div>
            </dl>
          </section>
          <label>Current SMU *
            <input inputMode="numeric" type="number" value={currentSmu} onChange={(event) => setCurrentSmu(event.target.value)} />
          </label>
          {smuWarning && <p className="form-warning">{smuWarning}</p>}
          <section className="refill-compartment-card">
            <div>
              <strong>Fuel</strong>
              <span>Record fuel used during this service entry</span>
            </div>
            <label>Fuel Added (L)
              <input inputMode="numeric" type="number" min={0} value={fuelAdded} onChange={(event) => setFuelAdded(event.target.value)} />
            </label>
            <label>Fuel Source
              <select value={fuelSource} disabled><option>{fuelSource}</option></select>
            </label>
            {fuelSource === "Assigned Service Truck" && <div className="auto-source-line"><span>Assigned Truck:</span><strong>{assignedTruck?.truckId ?? "No assigned truck"}</strong></div>}
          </section>
          <h3>Oil / Service Items</h3>
          <label>Oil Source
            <select value={oilSource} disabled><option>{oilSource}</option></select>
          </label>
          {oilSource === "Service Truck Storage" && (
            <div className="auto-source-line">
              <span>Source:</span>
              <strong>Service Truck Storage - {assignedTruck?.truckId ?? "No assigned truck"}</strong>
            </div>
          )}
          {oilSource === "Workshop Storage" && (
            <div className="auto-source-line">
              <span>Source:</span>
              <strong>Workshop Storage - matching product compartment</strong>
            </div>
          )}
          {oilSource === "Bulk Storage" && (
            <div className="auto-source-line">
              <span>Source:</span>
              <strong>Bulk Storage - matching bulk tank</strong>
            </div>
          )}
          <div className="refill-card-list">
            {loadedAsset.oilConfiguration.filter((oil) => oil.active).map((oil) => (
              <article className="refill-compartment-card" key={oil.id}>
                <div>
                  <strong>{oil.compartment}</strong>
                  <span>{oil.product}</span>
                  <em>Capacity: {oil.capacity.toLocaleString()} L</em>
                </div>
                <label>Litres Added
                  <input inputMode="numeric" type="number" min={0} value={oilDraft[oil.id]?.litres ?? ""} onChange={(event) => updateOil(oil.id, { litres: Number(event.target.value) })} />
                </label>
                <label>Comments
                  <textarea value={oilDraft[oil.id]?.comments ?? ""} onChange={(event) => updateOil(oil.id, { comments: event.target.value })} placeholder="Optional comments" />
                </label>
              </article>
            ))}
          </div>
          <label>General Comments
            <textarea value={generalComments} onChange={(event) => setGeneralComments(event.target.value)} placeholder="Optional service comments" />
          </label>
          <button className="primary-button wide-button" type="button" onClick={submitServiceEntry}><Send size={18} /> Submit Service Entry</button>
        </>
      )}
    </div>
  );
}

type RefillDraft = Record<string, { litres: number }>;
type WorkshopRefillGroup = ServiceTruckOilGroup & { expectedLitres?: number };

function workshopProductsFromStore(): WorkshopRefillGroup[] {
  return loadWorkshopStock().map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    system: item.productId === "waste-oil" ? "Waste Oil" : "Workshop Storage",
    capacity: item.capacity,
    current: item.current,
    expectedLitres: item.expectedLitres ?? item.current,
    tone: item.tone === "green" ? "green" : "yellow",
  }));
}

function RefillsTab({ workArea, onSubmit }: { workArea: WorkArea; onSubmit: () => void }) {
  const targetType = workArea === "Service Truck" ? "Service Truck" : `${workArea} Storage`;
  const [trucks, setTrucks] = useState(loadServiceTrucks);
  const [bulkTanks, setBulkTanks] = useState(loadBulkTanks);
  const [selectedTruckId, setSelectedTruckId] = useState(localStorage.getItem("titan-employee-assigned-truck") ?? loadCurrentUser()?.assignedServiceTruckId ?? "");
  const [draft, setDraft] = useState<RefillDraft>({});
  const [workshopLevels, setWorkshopLevels] = useState<WorkshopRefillGroup[]>(workshopProductsFromStore);
  const selectedTruck = trucks.find((truck) => truck.truckId === selectedTruckId);
  const compartments: ServiceTruckOilGroup[] = targetType === "Service Truck" ? selectedTruck?.oilGroups ?? [] : workArea === "Field" ? loadFacilities().filter(row => row.department === "Field").map(row => ({ id: row.id, name: row.name, productId: row.productId, current: row.current, capacity: row.capacity, system: "Field Storage", tone: "green" })) : workshopLevels;

  function updateDraft(product: string, value: string | number) {
    setDraft((current) => ({
      ...current,
      [product]: {
        litres: Number(value),
      },
    }));
  }

  function getProductId(group: ServiceTruckOilGroup) {
    return group.productId ?? productIdForName(group.name);
  }

  function matchingBulkTank(group: ServiceTruckOilGroup) {
    return bulkTanks.find((tank) => tank.productId === getProductId(group));
  }

  function refillProgressTone(group: ServiceTruckOilGroup, percent: number) {
    if (getProductId(group) !== "waste-oil") return percent > 60 ? "green" : "yellow";
    const settings = loadSystemAlertSettings();
    if (percent >= settings.workshopWasteOilCriticalPercent) return "orange";
    if (percent >= settings.workshopWasteOilWarningPercent) return "yellow";
    return "green";
  }

  function submitRefill() {
    try {
      const entries = compartments.map(group => ({ group, litres: draft[group.name]?.litres ?? 0 })).filter(item => item.litres !== 0);
      if (!entries.length) throw new Error("Enter litres added for at least one compartment.");
      let next = loadSiteStock();
      for (const { group, litres } of entries) {
        const sources = loadBulkTanks().filter(tank => tank.productId === getProductId(group));
        if (sources.length !== 1) throw new Error(`Select the source for ${group.name} in Site Oil Storage; one matching bulk tank is required here.`);
        const index = selectedTruck?.oilGroups.findIndex(item => item.name === group.name) ?? -1;
        const destination = targetType === "Service Truck" ? `truck:${selectedTruck?.truckId}:${selectedTruck?.oilGroups[index]?.id ?? selectedTruck?.oilGroups[index]?.name}` : `${workArea === "Field" ? "facility" : "workshop"}:${group.id}`;
        next = applyStockOperation(next, { kind: "transfer", source: `bulk:${sources[0].id}`, destination, litres });
      }
      saveSiteStock(next);
      setTrucks(loadServiceTrucks()); setBulkTanks(loadBulkTanks()); setWorkshopLevels(workshopProductsFromStore());
      setDraft({}); onSubmit();
    } catch (error) { alert(error instanceof Error ? error.message : "Could not record refill."); }
  }
  return (
    <div className="employee-form">
      <h2>Refills</h2>
      <label>Target Type
        <select value={targetType} disabled><option>{targetType}</option></select>
      </label>
      {targetType === "Service Truck" && (
        <label>Service Truck
          <select value={selectedTruckId} disabled>
            {trucks.map((truck) => <option key={truck.truckId}>{truck.truckId}</option>)}
          </select>
        </label>
      )}
      <h3>{targetType === "Service Truck" ? "Compartments to Refill" : `${workArea} Products to Refill`}</h3>
      {!compartments.length && <p>No compartments available. Select your truck on Home, or ask management to configure stock for this work area.</p>}
      <div className="refill-card-list">
        {compartments.map((group) => {
          const percent = Math.round((group.current / group.capacity) * 100);
          const progressTone = refillProgressTone(group, percent);
          return (
            <article className="refill-compartment-card" key={group.name}>
              <div>
                <strong>{group.name}</strong>
                <span>Current: {group.current.toLocaleString()} L / {group.capacity.toLocaleString()} L</span>
              </div>
              <span className="soft-progress"><i className={progressTone} style={{ width: `${percent}%` }} /></span>
              <label>Litres Added
                <input inputMode="numeric" type="number" min={0} value={draft[group.name]?.litres ?? ""} onChange={(event) => updateDraft(group.name, event.target.value)} />
              </label>
              <div className={matchingBulkTank(group) ? "auto-source-line" : "auto-source-line source-warning"}>
                <span>Source:</span>
                <strong>{matchingBulkTank(group) ? `Bulk Tank - ${matchingBulkTank(group)?.name}` : "No matching bulk tank found for this product."}</strong>
              </div>
            </article>
          );
        })}
      </div>
      <button className="primary-button wide-button" type="button" onClick={submitRefill}><Fuel size={18} /> Submit Refill</button>
    </div>
  );
}

function DailySheetTab({ employee, onSend }: { employee: string; onSend: () => void }) {
  const [entries, setEntries] = useState(loadFuelSubmissions);
  const [serviceEntries, setServiceEntryState] = useState(loadServiceEntries);
  const [assets, setAssets] = useState(loadAssets);
  const employeeEntries = entries.filter((entry) => entry.employee === employee);
  const employeeServiceEntries = serviceEntries.filter((entry) => entry.employee === employee);
  const assetDetails = new Map(assets.map((asset) => [asset.assetNumber.toLowerCase(), asset]));
  const totalMachines = new Set(employeeEntries.map((entry) => entry.asset)).size;
  const totalLitres = employeeEntries.reduce((sum, entry) => sum + entry.litres, 0);
  const submitted = employeeEntries.length > 0 && employeeEntries.every((entry) => entry.submitted);

  useEffect(() => {
    const refreshDailySheet = () => {
      setEntries(loadFuelSubmissions());
      setServiceEntryState(loadServiceEntries());
      setAssets(loadAssets());
    };
    window.addEventListener("storage", refreshDailySheet);
    window.addEventListener("titan-fuel-submissions-updated", refreshDailySheet);
    window.addEventListener("titan-service-entries-updated", refreshDailySheet);
    window.addEventListener("titan-assets-updated", refreshDailySheet);
    return () => {
      window.removeEventListener("storage", refreshDailySheet);
      window.removeEventListener("titan-fuel-submissions-updated", refreshDailySheet);
      window.removeEventListener("titan-service-entries-updated", refreshDailySheet);
      window.removeEventListener("titan-assets-updated", refreshDailySheet);
    };
  }, []);

  function submitDailyFuelUps() {
    if (!confirm("Submit daily fuel ups? Entries will be locked from editing.")) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updated = entries.map((entry) =>
      entry.employee === employee ? {
        ...entry,
        date: entry.date ?? currentReportDate(),
        shift: entry.shift ?? currentFuelShift(),
        submitted: true,
        locked: true,
        submittedAt: time,
      } : entry,
    );
    setEntries(updated);
    saveFuelSubmissions(updated);
    const updatedServiceEntries = serviceEntries.map((entry) =>
      entry.employee === employee ? { ...entry, submitted: true } : entry,
    );
    setServiceEntryState(updatedServiceEntries);
    saveServiceEntries(updatedServiceEntries);
    onSend();
  }

  return (
    <div className="employee-tab">
      <h2>Daily Sheet</h2>
      <div className="daily-section"><strong>Total machines fuelled</strong><span>{totalMachines}</span></div>
      <div className="daily-section"><strong>Total litres</strong><span>{totalLitres.toLocaleString()} L</span></div>
      <div className="daily-section"><strong>Fuel source</strong><span>{Array.from(new Set(employeeEntries.map((entry) => entry.fuelSource))).join(", ")}</span></div>
      <div className="daily-section"><strong>Status</strong><span>{submitted ? "Submitted" : "Not Submitted"}</span></div>
      <h3>Fuel Entries</h3>
      <div className="employee-fuel-list">
        {employeeEntries.map((entry) => {
          const asset = assetDetails.get(entry.asset.toLowerCase());
          return (
            <article key={entry.id}>
              <strong>{entry.asset}</strong>
              <span>{asset ? `${asset.make} ${asset.model}` : "Asset details not found"}</span>
              <span>{entry.litres.toLocaleString()} L - {entry.fuelSource}</span>
              <em>{entry.locked ? "Locked" : "Editable Draft"}</em>
            </article>
          );
        })}
      </div>
      <h3>Service Entries</h3>
      <div className="employee-fuel-list">
        {employeeServiceEntries.map((entry) => {
          const asset = assetDetails.get(entry.assetNumber.toLowerCase());
          return (
            <article key={entry.id}>
              <strong>{entry.assetNumber} - {asset?.make ?? entry.make} {asset?.model ?? entry.model}</strong>
              <span>SMU {entry.smu.toLocaleString()} - Fuel {entry.fuelAdded.toLocaleString()} L - {entry.fuelSource}</span>
              <span>{entry.oils.map((oil) => `${oil.product}: ${oil.litres} L`).join(", ") || "No oils added"}</span>
              <span>{entry.comments || "No comments"}</span>
              <em>{entry.submitted ? "Submitted" : "Not Submitted"}</em>
            </article>
          );
        })}
      </div>
      <button className="primary-button wide-button" type="button" onClick={submitDailyFuelUps} disabled={submitted}>
        <Send size={18} />
        {submitted ? "Daily Fuel Ups Submitted" : "Submit Daily Fuel Ups"}
      </button>
    </div>
  );
}
