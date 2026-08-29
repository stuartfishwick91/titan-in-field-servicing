import { AlertTriangle, Bell, ClipboardCheck, Droplets, Fuel, Truck, UserRound } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useBranding } from "../../branding/BrandingContext";
import { loadServiceTrucks, type ServiceTruckRecord } from "../../data/serviceTruckStore";
import { useEffect, useState } from "react";
import { buildLiveAlerts, liveAlertEvents, type LiveAlert } from "../../data/liveAlerts";
import { loadBulkTanks, productIdForName } from "../../data/bulkTankStore";
import { levelAlertTone, loadSystemAlertSettings } from "../../data/systemSettingsStore";
import { useNavigate } from "react-router-dom";

type GaugeItem = {
  name: string;
  percent: number;
  current: number;
  capacity: number;
  tone: "green" | "yellow" | "blue" | "orange";
};

const submissions = [
  { time: "09:12", employee: "Stuart Fishwick", asset: "Workshop Bay 1", activity: "Workshop Engine Oil Refill", litres: "240 L", status: "Submitted" },
  { time: "08:47", employee: "Alicia Brown", asset: "Workshop Storage", activity: "Workshop Waste Oil Dip", litres: "380 L", status: "Submitted" },
  { time: "08:18", employee: "Mark Chen", asset: "Workshop Bay 2", activity: "Workshop Coolant Top Up", litres: "60 L", status: "Submitted" },
  { time: "07:51", employee: "Stuart Fishwick", asset: "Workshop Storage", activity: "Workshop Hydraulic Oil Refill", litres: "120 L", status: "Submitted" },
];

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
    };
    liveAlertEvents.forEach((eventName) => window.addEventListener(eventName, refresh));
    return () => {
      liveAlertEvents.forEach((eventName) => window.removeEventListener(eventName, refresh));
    };
  }, []);

  return (
    <div className="executive-dashboard">
      <header className="executive-header">
        <div>
          <h1>Dashboard</h1>
          <p>Read-only executive overview of in-field servicing operations</p>
        </div>
        <div className="bulk-header-actions">
          <button className="date-button" type="button">26 Jun 2026</button>
          <button className="icon-alert-button" type="button" onClick={() => setShowAlertDetails((current) => !current)} aria-expanded={showAlertDetails} aria-label="Show live alert details"><Bell size={18} /><span>{activeAlertCount}</span></button>
          <div className="admin-card"><UserRound size={19} /><div><strong>Admin User</strong><span>Administrator</span></div></div>
        </div>
      </header>

      <section className="executive-kpis">
        <KpiCard icon={<Fuel size={22} />} label="Fuel Used Today" value="7,480 L" detail="Current shift" />
        <KpiCard icon={<Droplets size={22} />} label="Oil Used Today" value="1,246 L" detail="Lubricants used" />
        <KpiCard icon={<Truck size={22} />} label="Machines Fuelled" value="36 / 42" detail="Fuelled this shift" />
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
                            <span className={`mini-bar ${group.tone}`}><i style={{ width: `${percent}%` }} /></span>
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
        <PanelTitle title="Recent Workshop Submissions" subtitle="Latest workshop-only submissions from employees" />
        <div className="table-wrap">
          <table className="executive-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Employee</th>
                <th>Asset</th>
                <th>Activity</th>
                <th>Litres</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={`${submission.time}-${submission.asset}`}>
                  <td>{submission.time}</td>
                  <td>{submission.employee}</td>
                  <td>{submission.asset}</td>
                  <td>{submission.activity}</td>
                  <td>{submission.litres}</td>
                  <td><span className="submission-status"><ClipboardCheck size={14} /> {submission.status}</span></td>
                </tr>
              ))}
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
    if (tank.percent >= alertSettings.bulkWasteOilCriticalPercent) return "orange";
    if (tank.percent >= alertSettings.bulkWasteOilWarningPercent) return "yellow";
    return "green";
  }
  return dashboardTankTone(tank.tone, levelAlertTone(tank.percent, alertSettings.bulkLowLevelPercent, alertSettings.bulkCriticalLevelPercent));
}

function alertRoute(moduleName: string) {
  const routes: Record<string, string> = {
    "Bulk Storage": "/management/bulk-storage",
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
