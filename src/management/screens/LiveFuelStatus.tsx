import { ExternalLink, Fuel, Plus, RefreshCw, Search, Truck, AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetTypeRequiresWindow, loadFuelSchedule, saveFuelSchedule, scheduleLabel, statusFromWindow, type FuelScheduleEntry, type FuelScheduleStatus, type FuelShift } from "../../data/fuelScheduleStore";
import { loadServiceTrucks } from "../../data/serviceTruckStore";
import { loadAssets, saveAssets, type EditableAsset } from "../../data/assetStore";
import { loadSystemAlertSettings } from "../../data/systemSettingsStore";

const statusOptions = ["All", "Fuelled", "Not Fuelled", "In Service"];
type ScheduleShiftSelection = FuelShift | "Both Shifts";
type ScheduleManagerRow = {
  id: string;
  asset: FuelScheduleEntry;
  shiftLabel: ScheduleShiftSelection;
  entries: FuelScheduleEntry[];
};

export function LiveFuelStatus({ readOnly = false, displayMode = false }: { readOnly?: boolean; displayMode?: boolean }) {
  const [schedule, setSchedule] = useState(loadFuelSchedule);
  const [shift, setShift] = useState<FuelShift>(() => displayMode ? displayShiftFromSettings() : "Day Shift");
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("All");
  const [fuelSource, setFuelSource] = useState(displayMode ? "Fuel Farm" : "All");
  const [status, setStatus] = useState("All");
  const [message, setMessage] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [draft, setDraft] = useState<FuelScheduleEntry>(defaultScheduleDraft(defaultFuelShift(shift)));
  const [draftShiftSelection, setDraftShiftSelection] = useState<ScheduleShiftSelection>(shift);
  const [assets, setAssets] = useState<EditableAsset[]>(loadAssets);
  const [collapsedScheduleGroups, setCollapsedScheduleGroups] = useState<string[]>([]);
  const [editFocusActive, setEditFocusActive] = useState(false);
  const scheduleEditorRef = useRef<HTMLDivElement | null>(null);
  const serviceTrucks = useMemo(() => loadServiceTrucks(), []);
  const sourceType = draft.assignedFuelSource === "Fuel Farm" ? "Fuel Farm" : "Service Truck Asset";

  useEffect(() => {
    const refresh = () => setSchedule(loadFuelSchedule());
    window.addEventListener("storage", refresh);
    window.addEventListener("titan-fuel-schedule-updated", refresh);
    window.addEventListener("titan-assets-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("titan-fuel-schedule-updated", refresh);
      window.removeEventListener("titan-assets-updated", refresh);
    };
  }, []);

  useEffect(() => {
    if (!readOnly) return undefined;
    const timer = window.setInterval(() => {
      setSchedule(loadFuelSchedule());
      setAssets(loadAssets());
      if (displayMode) setShift(displayShiftFromSettings());
    }, 10000);
    return () => window.clearInterval(timer);
  }, [displayMode, readOnly]);

  useEffect(() => {
    const refreshAssets = () => {
      setAssets(loadAssets());
      setSchedule(loadFuelSchedule());
    };
    window.addEventListener("storage", refreshAssets);
    window.addEventListener("titan-assets-updated", refreshAssets);
    return () => {
      window.removeEventListener("storage", refreshAssets);
      window.removeEventListener("titan-assets-updated", refreshAssets);
    };
  }, []);

  function persistSchedule(next: FuelScheduleEntry[]) {
    setSchedule(next);
    saveFuelSchedule(next);
  }

  const shifted = useMemo(() => schedule.filter((item) => item.shift === shift).map((item) => ({ ...item, status: statusFromWindow(item) })), [schedule, shift]);
  const assetTypes = useMemo(() => ["All", ...Array.from(new Set(shifted.map((item) => item.assetType)))], [shifted]);
  const fuelSources = useMemo(() => ["All", ...Array.from(new Set(shifted.map((item) => item.assignedFuelSource)))], [shifted]);

  const filtered = useMemo(() => shifted.filter((item) => (
    item.assetNumber.toLowerCase().includes(query.toLowerCase()) &&
    (assetType === "All" || item.assetType === assetType) &&
    (fuelSource === "All" || item.assignedFuelSource === fuelSource) &&
    (status === "All" || fuelDisplayStatus(item.status) === status)
  )), [assetType, fuelSource, query, shifted, status]);

  const scheduledCount = shifted.length;
  const fuelledCount = shifted.filter((item) => item.status === "Fuelled").length;
  const dueOverdueCount = shifted.filter((item) => item.status !== "In Service" && item.scheduledWindow && (item.status === "Due Soon" || item.status === "Overdue")).length;
  const unscheduledCount = shifted.filter((item) => item.unscheduled).length;
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((item) => {
      const current = groups.get(item.assetType) ?? [];
      groups.set(item.assetType, [...current, item]);
    });
    return Array.from(groups.entries());
  }, [filtered]);
  const groupedSchedule = useMemo(() => groupScheduleByAssetType(schedule), [schedule]);

  function refreshFilters() {
    setQuery("");
    setAssetType("All");
    setFuelSource(displayMode ? "Fuel Farm" : "All");
    setStatus("All");
    setMessage("Fuel schedule refreshed.");
  }

  function saveScheduledAsset() {
    if (assetTypeRequiresWindow(draft.assetType) && !draft.scheduledWindow) {
      setMessage(`${draft.assetType} requires a scheduled fuel window.`);
      return;
    }
    const assignedServiceTruckId = sourceType === "Service Truck Asset"
      ? draft.assignedServiceTruckId ?? serviceTrucks[0]?.truckId ?? null
      : null;
    const targetShifts: FuelShift[] = draftShiftSelection === "Both Shifts" ? ["Day Shift", "Night Shift"] : [draftShiftSelection];
    const baseEntry = {
      ...draft,
      assignedServiceTruckId,
      assignedFuelSource: sourceType === "Service Truck Asset" ? assignedServiceTruckId ?? draft.assignedFuelSource : "Fuel Farm",
      requiresFuelWindow: assetTypeRequiresWindow(draft.assetType),
      scheduledWindow: draft.assetType === "Haul Truck" ? null : draft.scheduledWindow || null,
    };
    const nextEntries = targetShifts.map((targetShift) => ({
      ...baseEntry,
      id: draft.id && targetShifts.length === 1 ? draft.id : `schedule-${draft.assetNumber}-${targetShift}-${Date.now()}`.replace(/\s+/g, "-").toLowerCase(),
      shift: targetShift,
    }));
    const nextSchedule = [...schedule];
    nextEntries.forEach((nextEntry) => {
      const existingIndex = nextSchedule.findIndex((item) =>
        item.id === nextEntry.id ||
        (item.assetNumber.toLowerCase() === nextEntry.assetNumber.toLowerCase() && item.shift === nextEntry.shift),
      );
      if (existingIndex >= 0) nextSchedule[existingIndex] = { ...nextSchedule[existingIndex], ...nextEntry, id: nextSchedule[existingIndex].id };
      else nextSchedule.unshift(nextEntry);
    });
    persistSchedule(nextSchedule);
    setDraft(defaultScheduleDraft(defaultFuelShift(draftShiftSelection)));
    setDraftShiftSelection(defaultFuelShift(draftShiftSelection));
    setMessage(`${baseEntry.assetNumber} scheduled for ${draftShiftSelection.toLowerCase()}.`);
  }

  function selectAsset(assetNumber: string) {
    const asset = assets.find((item) => item.assetNumber === assetNumber);
    if (!asset) {
      setDraft({ ...draft, assetNumber });
      return;
    }
    setDraft({
      ...draft,
      assetNumber: asset.assetNumber,
      make: asset.make,
      model: asset.model,
      assetType: asset.type,
      requiresFuelWindow: assetTypeRequiresWindow(asset.type),
      scheduledWindow: asset.type === "Haul Truck" ? null : draft.scheduledWindow,
    });
  }

  function toggleScheduleGroup(groupName: string) {
    setCollapsedScheduleGroups((current) =>
      current.includes(groupName)
        ? current.filter((item) => item !== groupName)
        : [...current, groupName],
    );
  }

  function focusScheduleEditor() {
    setEditFocusActive(true);
    window.setTimeout(() => {
      scheduleEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => setEditFocusActive(false), 1400);
    }, 40);
  }

  function openScheduleManager() {
    setManageOpen(true);
    setDraft(defaultScheduleDraft(defaultFuelShift(shift)));
    setDraftShiftSelection(defaultFuelShift(shift));
    focusScheduleEditor();
  }

  function editScheduleRow(row: ScheduleManagerRow) {
    setDraft(row.asset);
    setDraftShiftSelection(row.shiftLabel);
    focusScheduleEditor();
  }

  function removeScheduleRow(row: ScheduleManagerRow) {
    const idsToRemove = new Set(row.entries.map((entry) => entry.id));
    persistSchedule(schedule.filter((item) => !idsToRemove.has(item.id)));
    setMessage(`${row.asset.assetNumber} removed from ${row.shiftLabel.toLowerCase()}.`);
  }

  function updateOperationalStatus(assetNumber: string, nextStatus: "Working" | "In Service") {
    const assetStatus: EditableAsset["status"] = nextStatus === "In Service" ? "In Service" : "Active";
    const updatedAssets = assets.map((asset) =>
      asset.assetNumber.toLowerCase() === assetNumber.toLowerCase()
        ? { ...asset, status: assetStatus }
        : asset,
    );
    setAssets(updatedAssets);
    saveAssets(updatedAssets);
    persistSchedule(schedule.map((entry) => {
      if (entry.assetNumber.toLowerCase() !== assetNumber.toLowerCase()) return entry;
      if (nextStatus === "In Service") return { ...entry, status: "In Service", litresAdded: 0, lastFuelTime: "-" };
      return { ...entry, status: entry.status === "In Service" ? "Scheduled" : entry.status };
    }));
    setMessage(`${assetNumber} status set to ${nextStatus}.`);
  }

  function openFuelFarmDisplay() {
    const displayUrl = import.meta.env.MODE === "github-pages"
      ? `${import.meta.env.BASE_URL}#/live-fuel-status-display`
      : "/live-fuel-status-display";
    window.open(displayUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className={`live-fuel-page ${displayMode ? "live-fuel-display-page" : ""}`}>
      <div className="live-fuel-header">
        <div>
          <h1>{displayMode ? "Fuel Farm Live Schedule" : "Live Fuel Status"}</h1>
          <p>{displayMode ? "Read-only live view of assets assigned to the fuel farm" : "Scheduled fuel progress for the selected shift"}</p>
        </div>
        {!readOnly && (
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={openScheduleManager}><Plus size={18} /> Manage Fuel Schedule</button>
            <button className="primary-button export-fuel-button" type="button" onClick={openFuelFarmDisplay}>
              <ExternalLink size={18} />
              Fuel Farm Live Display
            </button>
          </div>
        )}
      </div>
      {message && <p className="success-banner">{message}</p>}

      <section className="fuel-kpi-grid">
        <FuelKpiCard tone="blue" icon={<Truck size={22} />} label="Scheduled Assets" value={`${scheduledCount}`} detail={shift} />
        <FuelKpiCard tone="green" icon={<Fuel size={22} />} label="Fuelled" value={`${fuelledCount}`} detail="Machines" />
        <FuelKpiCard tone="yellow" icon={<AlertTriangle size={22} />} label="Due / Overdue" value={`${dueOverdueCount}`} detail="Windowed assets" />
        <FuelKpiCard tone="red" icon={<AlertTriangle size={22} />} label="Unscheduled Fuel Ups" value={`${unscheduledCount}`} detail="Flagged" />
      </section>

      <section className="executive-panel live-fuel-panel">
        <div className="fuel-filter-grid">
          <FilterSelect label={displayMode ? "Auto Shift" : "Current Shift"} value={shift} options={["Day Shift", "Night Shift"]} disabled={displayMode} onChange={(value) => {
            if (!displayMode) setShift(value as FuelShift);
          }} />
          <label className="fuel-search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search asset number" />
          </label>
          <FilterSelect label="Asset type" value={assetType} options={assetTypes} onChange={setAssetType} />
          <FilterSelect label="Fuel source" value={fuelSource} options={fuelSources} onChange={setFuelSource} />
          <FilterSelect label="Status" value={status} options={statusOptions} onChange={setStatus} />
          {!displayMode && <button className="secondary-button fuel-refresh-button" type="button" onClick={refreshFilters}>
            <RefreshCw size={17} />
            Refresh
          </button>}
        </div>

        <div className="fuel-group-stack">
          {grouped.length === 0 && (
            <section className="empty-state-panel">
              <Truck size={34} />
              <h3>No live fuel assets yet</h3>
              <p>Add your real machines in Asset Management, then assign them here in Manage Fuel Schedule.</p>
            </section>
          )}
          {grouped.map(([groupName, items]) => {
            const groupFuelled = items.filter((item) => item.status === "Fuelled").length;
            const groupDue = items.filter((item) => item.status !== "In Service" && item.scheduledWindow && (item.status === "Due Soon" || item.status === "Overdue")).length;
            return (
              <section className="fuel-asset-group" key={groupName}>
                <div className="fuel-group-header">
                  <h3>{groupName}</h3>
                  <span>{items.length} assets</span>
                  <span>{groupFuelled} fuelled</span>
                  <span>{groupDue} due/overdue</span>
                </div>
                <div className="table-wrap">
                  <table className="fuel-status-table">
                    <thead>
                      <tr>
                        <th>Asset Number</th>
                        <th>Make / Model</th>
                        <th>SMU</th>
                        <th>Fuel Source</th>
                        <th>Assigned Employee</th>
                        <th>Schedule</th>
                        <th>Status</th>
                        <th>Machine Status</th>
                        <th>Litres Added</th>
                        <th>Last Fuel Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td><strong>{item.assetNumber}</strong>{item.unscheduled && <span className="unscheduled-badge">Unscheduled</span>}</td>
                          <td>{item.make} {item.model}</td>
                          <td>{item.smu.toLocaleString()}</td>
                          <td>{item.assignedFuelSource}</td>
                          <td>{item.assignedEmployee}</td>
                          <td>{scheduleLabel(item)}</td>
                          <td><span className={`fuel-status-badge ${statusClass(fuelDisplayStatus(item.status))}`}>{fuelDisplayStatus(item.status).toUpperCase()}</span></td>
                          <td>
                            {readOnly ? (
                              <span className={`machine-status-badge ${statusClass(operationalDisplayStatus(item.status))}`}>{operationalDisplayStatus(item.status)}</span>
                            ) : (
                              <select className="inline-status-select" value={operationalDisplayStatus(item.status)} onChange={(event) => updateOperationalStatus(item.assetNumber, event.target.value as "Working" | "In Service")}>
                                <option>Working</option>
                                <option>In Service</option>
                              </select>
                            )}
                          </td>
                          <td>{item.litresAdded ? `${item.litresAdded.toLocaleString()} L` : "-"}</td>
                          <td>{item.lastFuelTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {!readOnly && manageOpen && (
        <section className="detail-panel fuel-schedule-manager">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>Manage Fuel Schedule</h3>
              <span>Add, edit or remove scheduled fuel assets</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setManageOpen(false)}>Close</button>
          </div>
          <div ref={scheduleEditorRef} className={`schedule-editor-panel ${editFocusActive ? "editing-focus" : ""}`}>
          <div className="settings-grid report-filter-grid">
            <label>Asset Number<select value={draft.assetNumber} onChange={(event) => selectAsset(event.target.value)}>
              <option value="">Select asset</option>
              {assets.map((asset) => <option key={asset.assetNumber} value={asset.assetNumber}>{asset.assetNumber} - {asset.make} {asset.model}</option>)}
            </select></label>
            <label>Shift<select value={draftShiftSelection} onChange={(event) => {
              const nextShift = event.target.value as ScheduleShiftSelection;
              setDraftShiftSelection(nextShift);
              if (nextShift !== "Both Shifts") setDraft({ ...draft, shift: nextShift });
            }}><option>Day Shift</option><option>Night Shift</option><option>Both Shifts</option></select></label>
            {draft.assetType === "Haul Truck" ? (
              <div className="schedule-rule-note">Haul Trucks are managed as shift fuel list assets and do not require a fuel window.</div>
            ) : (
              <label>Scheduled Window<input value={draft.scheduledWindow ?? ""} required={assetTypeRequiresWindow(draft.assetType)} onChange={(event) => setDraft({ ...draft, scheduledWindow: event.target.value })} /></label>
            )}
            <label>Fuel Source Type<select value={sourceType} onChange={(event) => {
              if (event.target.value === "Fuel Farm") {
                setDraft({ ...draft, assignedFuelSource: "Fuel Farm", assignedServiceTruckId: null });
                return;
              }
              const truckId = draft.assignedServiceTruckId ?? serviceTrucks[0]?.truckId ?? "";
              setDraft({ ...draft, assignedFuelSource: truckId || "Service Truck", assignedServiceTruckId: truckId || null });
            }}><option>Fuel Farm</option><option>Service Truck Asset</option></select></label>
            {sourceType === "Service Truck Asset" ? (
              <label>Fuel Source Service Truck<select value={draft.assignedFuelSource} onChange={(event) => setDraft({ ...draft, assignedFuelSource: event.target.value, assignedServiceTruckId: event.target.value })}>
                {serviceTrucks.map((truck) => <option key={truck.truckId} value={truck.truckId}>{truck.truckId} - {truck.registration}</option>)}
              </select></label>
            ) : (
              <div className="schedule-rule-note">Fuel Source: Fuel Farm</div>
            )}
            <label>Employee / Crew<input value={draft.assignedEmployee} onChange={(event) => setDraft({ ...draft, assignedEmployee: event.target.value })} /></label>
            <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as FuelScheduleEntry["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select></label>
          </div>
          <div className="settings-grid report-filter-grid">
            <label>Make<input value={draft.make} onChange={(event) => setDraft({ ...draft, make: event.target.value })} /></label>
            <label>Model<input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label>
            <label>Asset Type<select value={draft.assetType} onChange={(event) => {
              const nextType = event.target.value;
              setDraft({ ...draft, assetType: nextType, requiresFuelWindow: assetTypeRequiresWindow(nextType), scheduledWindow: nextType === "Haul Truck" ? null : draft.scheduledWindow });
            }}><option>Haul Truck</option><option>Excavator</option><option>Dozer</option><option>Drill</option><option>Water Cart</option><option>Support Equipment</option></select></label>
            <label>SMU<input type="number" value={draft.smu} onChange={(event) => setDraft({ ...draft, smu: Number(event.target.value) })} /></label>
          </div>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={saveScheduledAsset}>Save Scheduled Asset</button>
            <button className="secondary-button" type="button" onClick={() => {
              setDraft(defaultScheduleDraft(defaultFuelShift(shift)));
              setDraftShiftSelection(defaultFuelShift(shift));
            }}>Clear</button>
          </div>
          </div>
          <div className="asset-group-stack schedule-group-stack">
            {groupedSchedule.length === 0 && (
              <section className="empty-state-panel">
                <Truck size={34} />
                <h3>No scheduled assets yet</h3>
                <p>Select assets above and save them to build the live fuel schedule.</p>
              </section>
            )}
            {groupedSchedule.map(([groupName, rows]) => {
              const collapsed = collapsedScheduleGroups.includes(groupName);
              const dayCount = rows.filter((row) => row.entries.some((item) => item.shift === "Day Shift")).length;
              const nightCount = rows.filter((row) => row.entries.some((item) => item.shift === "Night Shift")).length;
              const fuelledCount = rows.filter((row) => row.entries.some((item) => statusFromWindow(item) === "Fuelled")).length;
              return (
                <section className="asset-group-panel" key={groupName}>
                  <button className="asset-group-header" type="button" onClick={() => toggleScheduleGroup(groupName)} aria-expanded={!collapsed}>
                    <div>
                      <span>{collapsed ? "+" : "-"}</span>
                      <strong>{groupName}</strong>
                    </div>
                    <em>{rows.length} assets</em>
                    <small>{dayCount} Day</small>
                    <small>{nightCount} Night</small>
                    <small>{fuelledCount} Fuelled</small>
                  </button>
                  {!collapsed && (
                    <DataTable
                      headers={["Asset", "Shift", "Assigned Truck", "Schedule", "Fuel Source", "Employee", "Priority", "Actions"]}
                      rows={rows.map((row) => [
                        row.asset.assetNumber,
                        row.shiftLabel,
                        row.asset.assignedServiceTruckId ?? "-",
                        scheduleLabel(row.asset),
                        row.asset.assignedFuelSource,
                        row.asset.assignedEmployee,
                        row.asset.priority,
                        <div className="table-actions" key={`${row.id}-actions`}>
                          <button className="edit-button" type="button" onClick={() => editScheduleRow(row)}>Edit</button>
                          <button className="edit-button danger-edit" type="button" onClick={() => removeScheduleRow(row)}>Remove</button>
                        </div>,
                      ])}
                    />
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}

function FuelKpiCard({ tone, icon, label, value, detail }: { tone: "blue" | "green" | "yellow" | "red"; icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className={`fuel-kpi-card ${tone}`}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function FilterSelect({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="fuel-select">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function fuelDisplayStatus(status: FuelScheduleStatus): "Fuelled" | "Not Fuelled" | "In Service" {
  if (status === "In Service") return "In Service";
  return status === "Fuelled" || status === "Unscheduled" ? "Fuelled" : "Not Fuelled";
}

function operationalDisplayStatus(status: FuelScheduleStatus): "Working" | "In Service" {
  return status === "In Service" ? "In Service" : "Working";
}

function displayShiftFromSettings(now = new Date()): FuelShift {
  const settings = loadSystemAlertSettings();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const dayStart = minutesFromTime(settings.fuelDisplayDayShiftStart);
  const nightStart = minutesFromTime(settings.fuelDisplayNightShiftStart);
  if (dayStart <= nightStart) {
    return currentMinutes >= dayStart && currentMinutes < nightStart ? "Day Shift" : "Night Shift";
  }
  return currentMinutes >= nightStart && currentMinutes < dayStart ? "Night Shift" : "Day Shift";
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

function defaultFuelShift(shift: ScheduleShiftSelection): FuelShift {
  return shift === "Both Shifts" ? "Day Shift" : shift;
}

const scheduleGroupOrder = ["Haul Trucks", "Excavators", "Dozers", "Drills", "Water Carts", "Service Trucks / Support", "Other Assets"];

function scheduleGroupLabel(assetType: string) {
  const value = assetType.trim().toLowerCase();
  if (!value) return "Other Assets";
  if (value.includes("service") || value.includes("support") || value.includes("light")) return "Service Trucks / Support";
  if (value.includes("haul") || value.includes("truck")) return "Haul Trucks";
  if (value.includes("excavator")) return "Excavators";
  if (value.includes("dozer")) return "Dozers";
  if (value.includes("drill")) return "Drills";
  if (value.includes("water")) return "Water Carts";
  return `${assetType}s`;
}

function groupScheduleByAssetType(entries: FuelScheduleEntry[]) {
  const rowsByAsset = new Map<string, ScheduleManagerRow>();
  entries.forEach((entry) => {
    const key = `${entry.assetType.toLowerCase()}-${entry.assetNumber.toLowerCase()}`;
    const current = rowsByAsset.get(key);
    if (!current) {
      rowsByAsset.set(key, { id: key, asset: entry, shiftLabel: entry.shift, entries: [entry] });
      return;
    }
    const nextEntries = [...current.entries, entry];
    const hasDay = nextEntries.some((item) => item.shift === "Day Shift");
    const hasNight = nextEntries.some((item) => item.shift === "Night Shift");
    rowsByAsset.set(key, {
      ...current,
      asset: nextEntries.find((item) => item.shift === "Day Shift") ?? current.asset,
      shiftLabel: hasDay && hasNight ? "Both Shifts" : nextEntries[0].shift,
      entries: nextEntries,
    });
  });

  const groups = new Map<string, ScheduleManagerRow[]>();
  Array.from(rowsByAsset.values()).forEach((row) => {
    const label = scheduleGroupLabel(row.asset.assetType);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  });
  return Array.from(groups.entries()).sort(([left], [right]) => {
    const leftIndex = scheduleGroupOrder.indexOf(left);
    const rightIndex = scheduleGroupOrder.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? scheduleGroupOrder.length : leftIndex) - (rightIndex === -1 ? scheduleGroupOrder.length : rightIndex);
    }
    return left.localeCompare(right);
  });
}

function defaultScheduleDraft(shift: FuelShift): FuelScheduleEntry {
  return {
    id: "",
    assetNumber: "",
    make: "",
    model: "",
    assetType: "Haul Truck",
    smu: 0,
    shift,
    requiresFuelWindow: false,
    scheduledWindow: null,
    assignedFuelSource: "Fuel Farm",
    assignedServiceTruckId: null,
    assignedEmployee: "",
    priority: "Medium",
    status: "Scheduled",
    litresAdded: 0,
    lastFuelTime: "-",
    unscheduled: false,
  };
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
