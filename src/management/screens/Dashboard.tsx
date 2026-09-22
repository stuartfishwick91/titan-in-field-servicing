import { stockLevel } from "../../data/stockLevelAlerts";
import { AlertTriangle, Bell, ClipboardCheck, Droplets, Fuel, Truck, UserRound } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useBranding } from "../../branding/BrandingContext";
import { loadServiceTrucks, type ServiceTruckRecord } from "../../data/serviceTruckStore";
import { useEffect, useState } from "react";
import { buildLiveAlerts, liveAlertEvents, type LiveAlert } from "../../data/liveAlerts";
import { loadBulkTanks, productIdForName } from "../../data/bulkTankStore";
import { levelAlertTone, loadSystemAlertSettings } from "../../data/systemSettingsStore";
import { useNavigate } from "react-router-dom";
import { loadFuelSubmissions } from "../../data/fuelSubmissionStore";
import { loadServiceEntries } from "../../data/serviceEntryStore";
import { loadCurrentUser } from "../../data/userAccessStore";
import { calculateDashboardMetrics } from "../../data/dashboardMetrics";

type GaugeItem = {
  name: string;
  percent: number;
  current: number;
  capacity: number;
  tone: "green" | "yellow" | "blue" | "orange";
};

function litres(value: number) {
  return value.toLocaleString();
}

function percentage(current: number, capacity: number) {
  return Math.round((current / capacity) * 100);
}

export function Dashboard() {
  const { branding } = useBranding();
  const navigate = useNavigate();
  const [trucks, setTrucks] = useState<ServiceTruckRecord[]>(loadServiceTrucks);
  const [alertSettings, setAlertSettings] = useState(loadSystemAlertSettings);
  const [bulkStorage, setBulkStorage] = useState<GaugeItem[]>(loadDashboardBulkStorage);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>(buildLiveAlerts);
  const [showAlertDetails, setShowAlertDetails] = useState(false);
  const [fuelEntries, setFuelEntries] = useState(loadFuelSubmissions);
  const [serviceEntries, setServiceEntries] = useState(loadServiceEntries);
  const currentUser = loadCurrentUser();
  const metrics = calculateDashboardMetrics(fuelEntries, serviceEntries);
  const workshopEntries = serviceEntries.filter((entry) => entry.oils.some((oil) => oil.source === "Workshop Storage"));
  const activeAlertCount = liveAlerts.length;
  const [selectedTruckId, setSelectedTruckId] = useState(trucks[0]?.truckId ?? "RD4830");
  const selectedTruck = trucks.find((truck) => truck.truckId === selectedTruckId) ?? trucks[0];
  const truckOilGroups = selectedTruck?.oilGroups ?? [];
  const truckTotalCapacity = truckOilGroups.reduce((sum, group) => sum + group.capacity, 0);
  const truckTotalCurrent = truckOilGroups.reduce((sum, group) => sum + group.current, 0);
  const truckOverall = truckTotalCapacity ? Math.round((truckTotalCurrent / truckTotalCapacity) * 100) : 0;
  useEffect(() => {
    const refresh = () => {
      setTrucks(loadServiceTrucks());
      setAlertSettings(loadSystemAlertSettings());
      setBulkStorage(loadDashboardBulkStorage());
      setLiveAlerts(buildLiveAlerts());
      setFuelEntries(loadFuelSubmissions());
      setServiceEntries(loadServiceEntries());
    };
    const events = [...liveAlertEvents, "titan-fuel-submissions-updated", "titan-service-entries-updated"];
    events.forEach((eventName) => window.addEventListener(eventName, refresh));
    const timer = window.setInterval(refresh, 60000);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, refresh));
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="executive-dashboard">
      <header className="executive-header">
        <div>
          <span className="eyebrow">Titan / Operations</span><h1>Site overview</h1>
          <p>Today’s activity, stock levels and items needing attention.</p>
        </div>
        <div className="bulk-header-actions">
          <span className="date-button">{new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })}</span>
          <button className="icon-alert-button" type="button" onClick={() => setShowAlertDetails((current) => !current)} aria-expanded={showAlertDetails} aria-label="Show live alert details"><Bell size={18} /><span>{activeAlertCount}</span></button>
          <div className="admin-card"><UserRound size={19} /><div><strong>{currentUser?.fullName}</strong><span>{currentUser?.role}</span></div></div>
        </div>
      </header>

      <section className="attention-panel"><div className="section-heading-row"><div><span className="eyebrow">Supervisor priorities</span><h2>{activeAlertCount ? activeAlertCount + " items need attention" : "No active stock alerts"}</h2></div><button className="secondary-button" type="button" onClick={() => navigate("/management/reports")}>View daily activity</button></div><div className="attention-list">{[...liveAlerts].sort((a,b) => Number(b.severity === "critical") - Number(a.severity === "critical")).slice(0,3).map(alert => <button type="button" key={alert.id} className={"attention-item " + alert.severity} onClick={() => navigate(alertRoute(alert.module))}><span>{alert.severity === "critical" ? "Critical" : "Review"}</span><strong>{alert.title}</strong><small>{alert.detail}</small></button>)}</div>{activeAlertCount > 3 && <button type="button" className="secondary-button" onClick={() => setShowAlertDetails(true)}>View all {activeAlertCount} alerts</button>}</section>
      <section className="executive-kpis">
        <KpiCard icon={<Fuel size={22} />} label="Fuel Used Today" value={`${litres(metrics.fuelLitres)} L`} detail="Recorded fuel entries today" />
        <KpiCard icon={<Droplets size={22} />} label="Oil Used Today" value={`${litres(metrics.oilLitres)} L`} detail="Recorded service oils and coolant today" />
        <KpiCard icon={<Truck size={22} />} label="Machines Fuelled" value={String(metrics.machinesFuelled)} detail="Distinct assets fuelled today" />
        <KpiCard icon={<AlertTriangle size={22} />} label="Active Alerts" value={activeAlertCount.toString()} detail="Click to view details" danger={activeAlertCount > 0} onClick={() => setShowAlertDetails((current) => !current)} />
      </section>

      {showAlertDetails && (
        <AlertDetailsPanel
          alerts={liveAlerts}
          onClose={() => setShowAlertDetails(false)}
          onOpen={(moduleName) => {
            navigate(alertRoute(moduleName));
            setShowAlertDetails(false);
          }}
        />
      )}

      <section className="executive-panel">
        <PanelTitle title="Bulk Storage Overview" subtitle="Live tank percentages by oil type" />
        <div className="read-only-gauge-grid">
          {bulkStorage.map((tank) => (
            <article className="read-only-gauge-card" key={tank.name}>
              <h3>{tank.name}</h3>
              <div className={`large-ring ${dashboardBulkTone(tank, alertSettings)}`} style={{ "--level": `${tank.percent}%` } as CSSProperties}>
                <div>
                  <strong>{tank.percent}%</strong>
                  <span>Level</span>
                </div>
              </div>
              <b>{litres(tank.current)} L / {litres(tank.capacity)} L</b>
            </article>
          ))}
        </div>
      </section>

      <section className="executive-panel">
        <PanelTitle title="Service Truck Overview" subtitle="Read-only service truck stock snapshot" />
        <div className="dashboard-truck-layout">
          <aside className="dashboard-truck-card">
            <h3>Service Trucks</h3>
            <p>Selected truck inventory and oil stock levels</p>
            <label>
              Selected Truck
              <select value={selectedTruckId} onChange={(event) => setSelectedTruckId(event.target.value)}>
                {trucks.map((truck) => <option key={truck.truckId}>{truck.truckId}</option>)}
              </select>
            </label>
            <TruckImage image={selectedTruck?.imageUrl || branding.serviceTruckImage} />
            <dl className="truck-detail-list">
              <div><dt>Truck ID</dt><dd>{selectedTruck?.truckId}</dd></div>
              <div><dt>Registration</dt><dd>{selectedTruck?.registration}</dd></div>
              <div><dt>Capacity</dt><dd>{selectedTruck?.capacity.toLocaleString()} L</dd></div>
              <div><dt>Status</dt><dd><span className="active-pill">{selectedTruck?.status}</span></dd></div>
            </dl>
          </aside>
          <div className="dashboard-truck-table">
            <div className="stock-tabs read-only-tabs">
              <span>Stock Overview</span>
            </div>
            <div className="original-table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>Group / Oil Type</th>
                    <th>Capacity (L)</th>
                    <th>Current Level (L)</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {truckOilGroups.map((group) => {
                    const percent = percentage(group.current, group.capacity);
                    return (
                      <tr key={group.name}>
                        <td><strong>{group.name}</strong><span>{group.system}</span></td>
                        <td>{litres(group.capacity)}</td>
                        <td>{litres(group.current)}</td>
                        <td>
                          <div className="percent-cell">
                            <span className={`mini-bar ${dashboardTankTone("green", stockLevel({ key: group.name, department: "Service Trucks", name: group.name, productId: group.productId ?? productIdForName(group.name), current: group.current, expected: group.current, capacity: group.capacity }, alertSettings))}`}><i style={{ width: `${percent}%` }} /></span>
                            <b>{percent}%</b>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total-row">
                    <td><strong>Total Capacity</strong></td>
                    <td>{truckTotalCapacity.toLocaleString()} L</td>
                    <td><strong>Total Current</strong><br />{truckTotalCurrent.toLocaleString()} L</td>
                    <td><strong>Overall</strong><br /><em>{truckOverall}%</em></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="executive-panel">
        <PanelTitle title="Recent Workshop Service Entries" subtitle="Recorded service entries using workshop stock" />
        <div className="table-wrap">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Asset</th>
                <th>Activity</th>
                <th>Litres</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workshopEntries.slice(0, 10).map((submission) => (
                <tr key={submission.id}>
                  <td>{submission.date}</td>
                  <td>{submission.employee}</td>
                  <td>{submission.assetNumber}</td>
                  <td>Workshop oil / coolant service</td>
                  <td>{litres(submission.oils.filter((oil) => oil.source === "Workshop Storage").reduce((sum, oil) => sum + oil.litres, 0))} L</td>
                  <td><span className="submission-status"><ClipboardCheck size={14} /> {submission.submitted ? "Submitted" : "Recorded"}</span></td>
                </tr>
              ))}
              {!workshopEntries.length && <tr><td colSpan={6}>No workshop service entries recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function dashboardTankTone(baseTone: GaugeItem["tone"], alertTone: "normal" | "warning" | "critical") {
  if (alertTone === "critical") return "orange";
  if (alertTone === "warning") return "yellow";
  return baseTone;
}

function loadDashboardBulkStorage(): GaugeItem[] {
  return loadBulkTanks().map((tank) => {
    const percent = percentage(tank.currentLitres, tank.capacity);
    return {
      name: tank.name,
      percent,
      current: tank.currentLitres,
      capacity: tank.capacity,
      tone: tank.productId === "coolant" ? "blue" : tank.productId === "waste-oil" ? "orange" : percent < 50 ? "yellow" : "green",
    };
  });
}

function dashboardBulkTone(tank: GaugeItem, alertSettings: ReturnType<typeof loadSystemAlertSettings>) {
  if (productIdForName(tank.name) === "waste-oil") {
    if (tank.current / tank.capacity * 100 >= alertSettings.bulkWasteOilCriticalPercent) return "orange";
    if (tank.current / tank.capacity * 100 >= alertSettings.bulkWasteOilWarningPercent) return "yellow";
    return "green";
  }
  return dashboardTankTone("green", levelAlertTone(tank.capacity > 0 ? tank.current / tank.capacity * 100 : 100, alertSettings.bulkLowLevelPercent, alertSettings.bulkCriticalLevelPercent));
}

function alertRoute(moduleName: string) {
  const routes: Record<string, string> = {
    "Bulk Storage": "/management/bulk-tanks",
    "Field Storage": "/management/field-storage",
    "Light Vehicles": "/management/bulk-storage",
    "Workshop Storage": "/management/workshop-storage",
    "Service Trucks": "/management/service-trucks",
    "Live Fuel Status": "/management/live-fuel-status",
    "Employee Submissions": "/management/reports",
  };
  return routes[moduleName] ?? "/management/dashboard";
}

function AlertDetailsPanel({
  alerts,
  onClose,
  onOpen,
}: {
  alerts: LiveAlert[];
  onClose: () => void;
  onOpen: (moduleName: string) => void;
}) {
  const criticalCount = alerts.filter((alertItem) => alertItem.severity === "critical").length;
  const warningCount = alerts.filter((alertItem) => alertItem.severity === "warning").length;

  return (
    <section className="executive-panel alert-details-panel">
      <div className="section-heading-row">
        <div className="panel-title-copy">
          <h2>Live Alert Details</h2>
          <p>Threshold, variance and submission alerts currently active.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="alert-summary-strip">
        <article><span>Total Active</span><strong>{alerts.length}</strong></article>
        <article><span>Critical</span><strong className="alert-critical-text">{criticalCount}</strong></article>
        <article><span>Warnings</span><strong className="alert-warning-text">{warningCount}</strong></article>
      </div>
      <div className="alert-detail-list">
        {alerts.length ? alerts.map((alertItem) => (
          <article className={`alert-detail-card ${alertItem.severity}`} key={alertItem.id}>
            <div>
              <span className={`status-pill ${alertItem.severity === "critical" ? "bad" : "warn"}`}>{alertItem.severity === "critical" ? "Critical" : "Warning"}</span>
              <strong>{alertItem.title}</strong>
              <small>{alertItem.module}</small>
              <p>{alertItem.detail}</p>
            </div>
            <button className="secondary-button" type="button" onClick={() => onOpen(alertItem.module)}>Open</button>
          </article>
        )) : (
          <article className="alert-detail-card empty">
            <div>
              <strong>No Active Alerts</strong>
              <p>All live thresholds and submissions are currently clear.</p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

function KpiCard({ icon, label, value, detail, danger = false, onClick }: { icon: ReactNode; label: string; value: string; detail: string; danger?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <span className="kpi-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button className={`executive-kpi-card kpi-action ${danger ? "danger" : ""}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <article className={`executive-kpi-card ${danger ? "danger" : ""}`}>
      {content}
    </article>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="panel-title-copy">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function TruckImage({ image }: { image: string }) {
  if (image) {
    return <div className="truck-photo branded-truck-photo" style={{ backgroundImage: `url(${image})` }} aria-label="Service truck image" />;
  }
  return (
    <div className="truck-photo" aria-label="Service truck image">
      <div className="truck-cab" />
      <div className="truck-tank" />
      <div className="truck-wheel left" />
      <div className="truck-wheel right" />
    </div>
  );
}
