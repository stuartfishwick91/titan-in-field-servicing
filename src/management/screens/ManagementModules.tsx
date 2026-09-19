import { activityPeriod } from "../../data/dailyActivity";
import { readSharedItem, writeSharedItem } from "../../cloud/sharedStorage";
import { loadStockAudit, loadFacilities, saveFacilities, loadSiteStock, saveSiteStock } from "../../data/siteInventory";
import { applyStockOperation } from "../../data/siteInventoryModel";
import { Bell, Download, Droplets, Edit2, FileText, Plus, Printer, QrCode, Save, Upload, UserRound } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { LocalBackupButton } from "../../data/LocalBackupButton";
import { defaultBranding, fileToDataUrl, useBranding, type BrandingSettings } from "../../branding/BrandingContext";
import { loadServiceTrucks, saveServiceTrucks, type ServiceTruckOilGroup, type ServiceTruckRecord } from "../../data/serviceTruckStore";
import { loadBulkTanks, productIdForName, saveBulkTanks } from "../../data/bulkTankStore";
import { bulkTanks, employees, recentSubmissions, serviceTrucks, workshopTanks, type Tank } from "../../data/mockData";
import { defaultAssetQrPayload, generateAssetQrCode, loadAssets, saveAssets, type AssetOilConfiguration, type EditableAsset } from "../../data/assetStore";
import { defaultSystemAlertSettings, exceedsVarianceTolerance, levelAlertTone, loadSystemAlertSettings, resetSystemAlertSettings, saveSystemAlertSettings, type SystemAlertSettings } from "../../data/systemSettingsStore";
import { defaultUsers, loadCurrentUser, loadUsers, saveUsers, type EmployeePortalRole, type ManagedUser, type UserRole, type UserStatus } from "../../data/userAccessStore";
import { findOilTemplate, loadOilTemplates, saveOilTemplates, type OilTemplate, type OilTemplateCompartment } from "../../data/oilTemplateStore";
import { loadWorkshopStock, saveWorkshopStock as saveWorkshopStockStore, type WorkshopStockRecord } from "../../data/workshopStore";
import { loadStockAdjustmentRegister, recordStockAdjustment, type StockAdjustmentRegisterEntry } from "../../data/stockAdjustmentRegister";
import {
  buildDailyFuelSheetRows,
  buildDailyReconciliation,
  buildDailySummary,
  buildSubmittedDailyFuelSheetSummaryRows,
  buildReportHistory,
  downloadReport,
  reportDateFromIso,
  reportRowsToCsv,
  type ReconciliationItem,
} from "../../data/reconciliationReports";
import { buildLiveAlerts, liveAlertEvents } from "../../data/liveAlerts";

type LocalTank = {
  name: string;
  oilType: string;
  percent: number;
  current: number;
  expected: number;
  capacity: number;
  lowAlert: number;
  tone: string;
  supplier: string;
  sku: string;
};

function tankPercent(tank: Tank) {
  return Math.round((tank.currentLitres / tank.capacityLitres) * 100);
}

function useLiveAlertCount() {
  const [alertCount, setAlertCount] = useState(() => buildLiveAlerts().length);

  useEffect(() => {
    const refresh = () => setAlertCount(buildLiveAlerts().length);
    liveAlertEvents.forEach((eventName) => window.addEventListener(eventName, refresh));
    return () => {
      liveAlertEvents.forEach((eventName) => window.removeEventListener(eventName, refresh));
    };
  }, []);

  return alertCount;
}

function ModuleTitle({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="module-header-row">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MiniTank({ tank, actionLabel }: { tank: Tank; actionLabel: string }) {
  const value = tankPercent(tank);
  return (
    <article className="stock-card">
      <div className="stock-head">
        <div>
          <strong>{tank.name}</strong>
          <span>{tank.product}</span>
        </div>
        <b>{value}%</b>
      </div>
      <div className="stock-bar"><span style={{ width: `${value}%` }} /></div>
      <dl>
        <div><dt>Current</dt><dd>{tank.currentLitres.toLocaleString()} L</dd></div>
        <div><dt>Capacity</dt><dd>{tank.capacityLitres.toLocaleString()} L</dd></div>
        <div><dt>Low Alert</dt><dd>{tank.lowLevelPercent}%</dd></div>
      </dl>
      <button className="secondary-button" type="button">{actionLabel}</button>
    </article>
  );
}

function bulkTanksFromStore(): LocalTank[] {
  return loadBulkTanks().map((tank) => {
    const percent = Math.round((tank.currentLitres / tank.capacity) * 100);
    return {
      name: tank.name,
      oilType: tank.name,
      percent,
      current: tank.currentLitres,
      expected: tank.expectedLitres ?? tank.currentLitres,
      capacity: tank.capacity,
      lowAlert: tank.productId === "diesel" ? 20 : 30,
      tone: tank.productId === "diesel" ? "orange" : tank.productId === "coolant" ? "blue" : percent < 50 ? "yellow" : "green",
      supplier: tank.productId === "diesel" ? "Fuel Supplier" : "Titan Oils",
      sku: tank.productId.toUpperCase(),
    };
  });
}

export function BulkStorage() {
  const alertSettings = loadSystemAlertSettings();
  const alertCount = useLiveAlertCount();
  const [message, setMessage] = useState("");
  const [panelMode, setPanelMode] = useState<"details" | "edit" | "dip" | "delivery">("details");
  const [bulkStorageLevels, setBulkStorageLevelsState] = useState<LocalTank[]>(() => bulkTanksFromStore());
  const [selectedTankName, setSelectedTankName] = useState<string | null>(null);
  const [adjustmentRegister, setAdjustmentRegister] = useState<StockAdjustmentRegisterEntry[]>(loadStockAdjustmentRegister);
  const tankDetailRef = useRef<HTMLDivElement | null>(null);
  const [bulkHistory, setBulkHistory] = useState<string[][]>([]);
  const selectedTank = bulkStorageLevels.find((tank) => tank.name === selectedTankName) ?? null;
  const newBulkTank: LocalTank = { name: `New Oil Compartment ${bulkStorageLevels.length + 1}`, oilType: "New Oil Type", percent: 0, current: 0, expected: 0, capacity: 1000, lowAlert: 30, tone: "yellow", supplier: "Supplier", sku: "SKU" };

  useEffect(() => {
    const refresh = () => setBulkStorageLevelsState(bulkTanksFromStore());
    window.addEventListener("storage", refresh);
    window.addEventListener("titan-bulk-tanks-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("titan-bulk-tanks-updated", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshRegister = () => setAdjustmentRegister(loadStockAdjustmentRegister());
    window.addEventListener("storage", refreshRegister);
    window.addEventListener("titan-stock-adjustment-register-updated", refreshRegister);
    return () => {
      window.removeEventListener("storage", refreshRegister);
      window.removeEventListener("titan-stock-adjustment-register-updated", refreshRegister);
    };
  }, []);

  useEffect(() => {
    if (!selectedTankName) return;
    window.setTimeout(() => {
      tankDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, [selectedTankName, panelMode]);

  function setBulkStorageLevels(next: LocalTank[] | ((items: LocalTank[]) => LocalTank[])) {
    const resolved = typeof next === "function" ? next(bulkStorageLevels) : next;
    setBulkStorageLevelsState(resolved);
    saveBulkTanks(resolved.map((tank) => ({
      id: `bulk-${productIdForName(tank.name)}`,
      productId: productIdForName(tank.name),
      name: tank.name,
      currentLitres: tank.current,
      expectedLitres: tank.expected,
      capacity: tank.capacity,
    })));
  }

  function openTank(name: string, mode: "details" | "edit" | "dip" | "delivery" = "details") {
    setSelectedTankName(name);
    setPanelMode(mode);
    setMessage("");
  }

  function updateTank(updated: typeof bulkStorageLevels[number], note: string) {
    const percent = Math.round((updated.current / updated.capacity) * 100);
    const previousTank = bulkStorageLevels.find((item) => item.name === selectedTankName);
    setBulkStorageLevels((items) => {
      const expected = note === "Tank Edit" ? previousTank?.expected ?? updated.current : updated.expected ?? updated.current;
      const nextTank = { ...updated, expected, percent };
      return items.some((item) => item.name === selectedTankName)
        ? items.map((item) => item.name === selectedTankName ? nextTank : item)
        : [...items, nextTank];
    });
    if ((note === "Tank Edit" || note === "Tank Dip") && previousTank && previousTank.current !== updated.current) {
      recordStockAdjustment({
        area: "Bulk Storage",
        product: updated.name,
        previousLitres: previousTank.current,
        newLitres: updated.current,
        user: "Admin User",
        acknowledgement: `${note} current litre adjustment acknowledged.`,
      });
      setAdjustmentRegister(loadStockAdjustmentRegister());
    }
    setSelectedTankName(updated.name);
    setBulkHistory((items) => [[new Date().toLocaleString(), updated.name, note, "Bulk Storage", `${updated.current.toLocaleString()} L`, "Admin User"], ...items]);
    setMessage(`${updated.name} updated.`);
    setPanelMode("details");
  }

  function addBulkCompartment() {
    setSelectedTankName(newBulkTank.name);
    setBulkStorageLevels((items) => [...items, newBulkTank]);
    setPanelMode("edit");
    setMessage("New bulk oil compartment added. Update details and save.");
  }

  function removeBulkCompartment(name: string) {
    if (!confirm(`Remove ${name}?`)) return;
    const remaining = bulkStorageLevels.filter((tank) => tank.name !== name);
    setBulkStorageLevels(remaining);
    setSelectedTankName(null);
    setMessage(`${name} removed.`);
  }

  return (
    <section className="bulk-original-page">
      <header className="bulk-page-header">
        <div>
          <h2>Bulk Storage</h2>
          <p>Overview of operations and key metrics</p>
        </div>
        <div className="bulk-header-actions">
          <button className="date-button" type="button">26 Jun 2026</button>
          <button className="icon-alert-button" type="button"><Bell size={18} /><span>{alertCount}</span></button>
          <div className="admin-card"><UserRound size={19} /><div><strong>Admin User</strong><span>Administrator</span></div></div>
        </div>
      </header>

      <section className="original-panel">
        <div className="section-heading-row">
          <div className="section-heading">
            <h3>Bulk Storage</h3>
            <span>Monitor tank dips, deliveries and stock levels</span>
          </div>
          <div className="button-row workshop-actions">
            <button className="primary-button add-delivery-button" type="button" onClick={addBulkCompartment}><Plus size={18} /> Add Oil Compartment</button>
            <button className="primary-button add-delivery-button" type="button" onClick={() => openTank(bulkStorageLevels[0].name, "delivery")}><Plus size={18} /> Add Delivery</button>
          </div>
        </div>
        <div className="bulk-level-grid">
          {bulkStorageLevels.map((tank) => (
            <OriginalTankCard
              key={tank.name}
              tank={{ ...tank, tone: bulkTankTone(tank, alertSettings) }}
              actionLabel="View Tank Details"
              onAction={() => openTank(tank.name)}
            />
          ))}
        </div>
      </section>

      <ReconciliationPanel
        title="Daily Stock Reconciliation"
        subtitle="Bulk expected stock compared with supervisor tank dips"
        items={bulkReconciliationFromLevels(bulkStorageLevels)}
      />

      {message && <p className="success-banner">{message}</p>}
      {selectedTank && (
        <div ref={tankDetailRef}>
          <TankDetailPanel
            key={selectedTank.name}
            tank={selectedTank}
            mode={panelMode}
            history={bulkHistory}
            onMode={setPanelMode}
            onClose={() => setSelectedTankName(null)}
            onSave={updateTank}
            onRemove={removeBulkCompartment}
          />
        </div>
      )}
      <StockAdjustmentRegisterTable
        title="Bulk Storage Manual Adjustment Register"
        rows={adjustmentRegister.filter((entry) => entry.area === "Bulk Storage")}
      />
    </section>
  );
}

function OriginalTankCard({
  tank,
  actionLabel = "View Details",
  onAction,
}: {
  tank: { name: string; percent: number; current: number; capacity: number; tone: string };
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article className="bulk-level-card">
      <h4>{tank.name}</h4>
      <div className={`large-ring ${tank.tone}`} style={{ "--level": `${tank.percent}%` } as CSSProperties}>
        <div>
          <strong>{tank.percent}%</strong>
          <span>Level</span>
        </div>
      </div>
      <b>{tank.current.toLocaleString()} L / {tank.capacity.toLocaleString()} L</b>
      <button type="button" onClick={onAction}><span /> {actionLabel}</button>
    </article>
  );
}

function bulkReconciliationFromLevels(tanks: LocalTank[]): ReconciliationItem[] {
  const settings = loadSystemAlertSettings();
  return tanks.map((tank) => {
    const expected = tank.expected ?? tank.current;
    const actual = tank.current;
    const difference = expected - actual;
    const status = varianceStatusFromTolerance(difference, expected, settings.bulkVarianceTolerance, settings.bulkVarianceMode);
    return {
      area: "Bulk Storage",
      productId: tank.sku || tank.name,
      product: tank.name,
      opening: expected,
      deliveries: 0,
      refills: 0,
      transfers: 0,
      employeeUsage: 0,
      expected,
      actual,
      difference,
      status,
      supervisorNotes: status === "Balanced" ? "No action required." : "Supervisor review required.",
    };
  });
}

function workshopReconciliationFromLevels(tanks: Array<{ name: string; current: number; capacity: number; expectedLitres?: number }>): ReconciliationItem[] {
  const settings = loadSystemAlertSettings();
  return tanks.map((tank) => {
    const expected = tank.expectedLitres ?? tank.current;
    const actual = tank.current;
    const difference = expected - actual;
    const status = varianceStatusFromTolerance(difference, expected, settings.workshopVarianceTolerance, settings.workshopVarianceMode);
    return {
      area: "Workshop Storage",
      productId: tank.name,
      product: tank.name,
      opening: expected,
      deliveries: 0,
      refills: 0,
      transfers: 0,
      employeeUsage: 0,
      expected,
      actual,
      difference,
      status,
      supervisorNotes: status === "Balanced" ? "No action required." : "Supervisor review required.",
    };
  });
}

function varianceStatusFromTolerance(difference: number, expected: number, tolerance: number, mode: SystemAlertSettings["bulkVarianceMode"]): ReconciliationItem["status"] {
  if (difference === 0) return "Balanced";
  return exceedsVarianceTolerance(difference, expected, tolerance, mode) ? "Investigation Required" : "Small Variance";
}

function TankDetailPanel({
  tank,
  mode,
  history,
  onMode,
  onClose,
  onSave,
  onRemove,
}: {
  tank: LocalTank;
  mode: "details" | "edit" | "dip" | "delivery";
  history: string[][];
  onMode: (mode: "details" | "edit" | "dip" | "delivery") => void;
  onClose: () => void;
  onSave: (tank: LocalTank, note: string) => void;
  onRemove: (name: string) => void;
}) {
  const [draft, setDraft] = useState(tank);
  const [dipLitres, setDipLitres] = useState(tank.current);
  const [deliveryLitres, setDeliveryLitres] = useState(1000);
  const [pendingAdjustment, setPendingAdjustment] = useState<{ note: "Tank Edit" | "Tank Dip"; nextTank: LocalTank } | null>(null);
  const unaccountedOil = Math.max(0, tank.expected - tank.current);

  useEffect(() => {
    setDraft(tank);
    setDipLitres(tank.current);
    setDeliveryLitres(1000);
  }, [tank.name, tank.current, tank.capacity, tank.expected]);

  function saveDip() {
    if (!Number.isFinite(dipLitres) || dipLitres < 0 || dipLitres > tank.capacity) { alert("Enter measured stock between zero and capacity."); return; }
    const nextTank = { ...tank, current: dipLitres };
    if (dipLitres !== tank.current) {
      setPendingAdjustment({ note: "Tank Dip", nextTank });
      return;
    }
    onSave(nextTank, "Tank Dip");
  }

  function saveDelivery() {
    if (!Number.isFinite(deliveryLitres) || deliveryLitres <= 0 || tank.current + deliveryLitres > tank.capacity) { alert("Enter positive litres within the available tank capacity."); return; }
    onSave({ ...tank, current: tank.current + deliveryLitres, expected: tank.expected + deliveryLitres }, "Delivery");
  }

  function saveEdit() {
    if (draft.current !== tank.current) {
      setPendingAdjustment({ note: "Tank Edit", nextTank: draft });
      return;
    }
    onSave(draft, "Tank Edit");
  }

  function acknowledgeAdjustment() {
    if (!pendingAdjustment) return;
    onSave(pendingAdjustment.nextTank, pendingAdjustment.note);
    setPendingAdjustment(null);
  }

  return (
    <section className="detail-panel">
      <div className="section-heading-row">
        <div className="section-heading">
          <h3>{tank.name}</h3>
          <span>Tank detail and stock movement history</span>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="detail-grid">
        <article><span>Oil Type</span><strong>{tank.oilType}</strong></article>
        <article><span>Capacity</span><strong>{tank.capacity.toLocaleString()} L</strong></article>
        <article><span>Current Litres</span><strong>{tank.current.toLocaleString()} L</strong></article>
        <article><span>Current Percentage</span><strong>{tank.percent}%</strong></article>
        <article><span>Low Stock Alert</span><strong>{tank.lowAlert}%</strong></article>
        <article><span>Last Delivery</span><strong>20 May 2025</strong></article>
        <article><span>Usage Today</span><strong>850 L</strong></article>
        <article className={unaccountedOil ? "warning-card" : "good-card"}><span>Unaccounted Oil</span><strong>{unaccountedOil.toLocaleString()} L</strong></article>
      </div>
      <div className="button-row detail-actions">
        <button className="secondary-button" type="button" onClick={() => onMode("edit")}><Edit2 size={18} /> Edit Tank</button>
        <button className="secondary-button" type="button" onClick={() => onMode("dip")}>Record Tank Dip</button>
        <button className="primary-button" type="button" onClick={() => onMode("delivery")}><Plus size={18} /> Add Delivery</button>
        <button className="secondary-button danger-edit" type="button" onClick={() => onRemove(tank.name)}>Remove Compartment</button>
      </div>
      {mode === "edit" && (
        <div className="settings-grid">
          <label>Tank name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Oil type<input value={draft.oilType} onChange={(event) => setDraft({ ...draft, oilType: event.target.value })} /></label>
          <label>Capacity<input type="number" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: Number(event.target.value) })} /></label>
          <label>Current litres<input type="number" value={draft.current} onChange={(event) => setDraft({ ...draft, current: Number(event.target.value) })} /></label>
          <label>Low stock alert %<input type="number" value={draft.lowAlert} onChange={(event) => setDraft({ ...draft, lowAlert: Number(event.target.value) })} /></label>
          <label>Supplier / SKU<input value={`${draft.supplier} / ${draft.sku}`} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} /></label>
          <label>Notes<input defaultValue="Demo tank note" /></label>
          <button className="primary-button" type="button" onClick={saveEdit}><Save size={18} /> Save</button>
        </div>
      )}
      {mode === "dip" && (
        <div className="inline-form-panel">
          <label>Actual Tank Dip Litres<input type="number" value={dipLitres} onChange={(event) => setDipLitres(Number(event.target.value))} /></label>
          <strong className={tank.expected - dipLitres > 0 ? "unaccounted-warning" : "unaccounted-ok"}>Unaccounted Oil: {Math.max(0, tank.expected - dipLitres).toLocaleString()} L</strong>
          <button className="primary-button" type="button" onClick={saveDip}>Save Tank Dip</button>
        </div>
      )}
      {mode === "delivery" && (
        <div className="inline-form-panel">
          <label>Litres Delivered<input type="number" value={deliveryLitres} onChange={(event) => setDeliveryLitres(Number(event.target.value))} /></label>
          <label>Supplier / Note<input defaultValue={tank.supplier} /></label>
          <button className="primary-button" type="button" onClick={saveDelivery}><Plus size={18} /> Add Delivery</button>
        </div>
      )}
      {pendingAdjustment && (
        <ManualAdjustmentWarning
          product={tank.name}
          previousLitres={tank.current}
          newLitres={pendingAdjustment.nextTank.current}
          onCancel={() => setPendingAdjustment(null)}
          onConfirm={acknowledgeAdjustment}
        />
      )}
      <div className="detail-tables">
        <DataTable headers={["Date/time", "Product", "Type", "Target", "Litres", "Employee"]} rows={history} />
        <DataTable headers={["Date/time", "Product", "Movement", "Location", "Litres", "Employee"]} rows={history} />
      </div>
    </section>
  );
}

export function WorkshopStorage({ department = "Workshop" }: { department?: "Workshop" | "Field" }) {
  const storageArea = department === "Field" ? "Field Storage" : "Workshop Storage";
  const loadDepartmentStock = (): WorkshopStockRecord[] => department === "Workshop" ? loadWorkshopStock() : loadFacilities().filter(row => row.department === "Field").map(row => ({ id: row.id, productId: row.productId, name: row.name, current: row.current, expectedLitres: row.expected, capacity: row.capacity, tone: "green" }));
  const blankCompartment: WorkshopStockRecord = { id: "", productId: "engine-15w40", name: "Engine Oil 15W-40", current: 0, expectedLitres: 0, capacity: 1000, tone: "green" };
  const alertSettings = loadSystemAlertSettings();
  const [editing, setEditing] = useState(false);
  const [refilling, setRefilling] = useState(false);
  const [dipping, setDipping] = useState(false);
  const [message, setMessage] = useState("");
  const [editingWorkshopName, setEditingWorkshopName] = useState("");
  const [workshopLevels, setWorkshopLevelsState] = useState<WorkshopStockRecord[]>(loadDepartmentStock);
  const [adjustmentRegister, setAdjustmentRegister] = useState<StockAdjustmentRegisterEntry[]>(loadStockAdjustmentRegister);
  const [pendingWorkshopAdjustment, setPendingWorkshopAdjustment] = useState<{ type: "edit" | "dip"; product: string; previousLitres: number; newLitres: number } | null>(null);
  const [draft, setDraft] = useState(workshopLevels[0] ?? blankCompartment);
  const [dipLitres, setDipLitres] = useState(workshopLevels[0]?.current ?? 0);
  const [refillDraft, setRefillDraft] = useState({ product: workshopLevels[0]?.name ?? "", litres: 250, source: "Engine Oil 15W-40", employee: "Admin User" });
  const workshopDetailRef = useRef<HTMLDivElement | null>(null);
  const refillHistory = loadStockAudit().flatMap(event => event.changes.filter(change => change.department === department && !change.configuration && change.after > change.before && Math.abs((change.after - change.before) - (change.expectedAfter - change.expectedBefore)) < 0.0001).flatMap(change => {
    const source = event.changes.find(item => item.productId === change.productId && item.after < item.before && !item.configuration);
    return source ? [[new Date(event.at).toLocaleString(), change.name, source.name, department, (change.after - change.before).toLocaleString() + " L", event.user]] : [];
  }));
  const newWorkshopCompartment: WorkshopStockRecord = { id: crypto.randomUUID(), productId: "new-oil", name: `${department} New Oil ${workshopLevels.length + 1}`, current: 0, expectedLitres: 0, capacity: 1000, tone: "yellow" };

  useEffect(() => {
    const refresh = () => setWorkshopLevelsState(loadDepartmentStock());
    window.addEventListener("storage", refresh);
    window.addEventListener(department === "Field" ? "titan-site-stock-updated" : "titan-workshop-stock-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(department === "Field" ? "titan-site-stock-updated" : "titan-workshop-stock-updated", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshRegister = () => setAdjustmentRegister(loadStockAdjustmentRegister());
    window.addEventListener("storage", refreshRegister);
    window.addEventListener("titan-stock-adjustment-register-updated", refreshRegister);
    return () => {
      window.removeEventListener("storage", refreshRegister);
      window.removeEventListener("titan-stock-adjustment-register-updated", refreshRegister);
    };
  }, []);

  useEffect(() => {
    if (!editing && !refilling && !dipping) return;
    window.setTimeout(() => {
      workshopDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, [editing, refilling, dipping, editingWorkshopName]);

  function setWorkshopLevels(next: WorkshopStockRecord[] | ((items: WorkshopStockRecord[]) => WorkshopStockRecord[])) {
    const resolved = typeof next === "function" ? next(workshopLevels) : next;
    setWorkshopLevelsState(resolved);
    if (department === "Workshop") saveWorkshopStockStore(resolved);
    else saveFacilities([...loadFacilities().filter(row => row.department !== "Field"), ...resolved.map(row => ({ id: row.id, department: "Field" as const, name: row.name, productId: row.productId, current: row.current, expected: row.expectedLitres ?? row.current, capacity: row.capacity }))]);
  }

  function saveWorkshopStock(acknowledged = false) {
    if (!draft.name.trim() || !Number.isFinite(draft.capacity) || draft.capacity <= 0 || !Number.isFinite(draft.current) || draft.current < 0 || draft.current > draft.capacity) { setMessage("Enter a name, positive capacity and stock between zero and capacity."); return; }
    if (workshopLevels.some(item => item.name === draft.name && item.name !== editingWorkshopName)) { setMessage("Use a unique compartment name."); return; }
    const previousItem = workshopLevels.find((item) => item.name === editingWorkshopName);
    if (previousItem && previousItem.productId !== draft.productId && (previousItem.current !== 0 || (previousItem.expectedLitres ?? previousItem.current) !== 0)) { setMessage("Transfer or reconcile stock before changing its product."); return; }
    if (previousItem && previousItem.current !== draft.current && !acknowledged) {
      setPendingWorkshopAdjustment({ type: "edit", product: previousItem.name, previousLitres: previousItem.current, newLitres: draft.current });
      return;
    }
    setWorkshopLevels((items) =>
      items.some((item) => item.name === editingWorkshopName)
        ? items.map((item) =>
          item.name === editingWorkshopName ? { ...draft, productId: draft.productId, expectedLitres: item.expectedLitres ?? item.current } : item,
        )
        : [...items, { ...draft, productId: productIdForName(draft.name), expectedLitres: draft.current }],
    );
    if (previousItem && previousItem.current !== draft.current) {
      recordStockAdjustment({
        area: storageArea,
        product: draft.name,
        previousLitres: previousItem.current,
        newLitres: draft.current,
        user: "Admin User",
        acknowledgement: `${department} edit current litre adjustment acknowledged.`,
      });
      setAdjustmentRegister(loadStockAdjustmentRegister());
    }
    setEditingWorkshopName(draft.name);
    setEditing(false);
    setMessage(`${draft.name} stock updated.`);
  }

  function addWorkshopCompartment() {
    setDraft(newWorkshopCompartment);
    setEditingWorkshopName("");
    setEditing(true);
    setRefilling(false);
    setDipping(false);
    setMessage(`Enter the new ${department.toLowerCase()} compartment details and save.`);
  }

  function removeWorkshopCompartment() {
    const stored = workshopLevels.find(item => item.name === editingWorkshopName);
    if (stored && (stored.current !== 0 || (stored.expectedLitres ?? stored.current) !== 0)) { setMessage("Transfer or reconcile remaining stock before removing the compartment."); return; }
    if (!confirm(`Remove ${draft.name}?`)) return;
    const remaining = workshopLevels.filter((item) => item.name !== editingWorkshopName);
    setWorkshopLevels(remaining);
    setDraft(remaining[0] ?? newWorkshopCompartment);
    setEditing(false);
    setDipping(false);
    setMessage(`${draft.name} removed.`);
  }

  function openWorkshopDetails(tank: WorkshopStockRecord) {
    setDraft(tank);
    setDipLitres(tank.current);
    setEditingWorkshopName(tank.name);
    setEditing(true);
    setRefilling(false);
    setDipping(false);
    setMessage("");
  }

  function openWorkshopDip() {
    setDipLitres(draft.current);
    setDipping(true);
    setEditing(false);
    setRefilling(false);
    setMessage("");
  }

  function saveWorkshopDip(acknowledged = false) {
    if (!Number.isFinite(dipLitres) || dipLitres < 0 || dipLitres > draft.capacity) { setMessage("Enter measured litres between zero and capacity."); return; }
    if (dipLitres !== draft.current && !acknowledged) {
      setPendingWorkshopAdjustment({ type: "dip", product: draft.name, previousLitres: draft.current, newLitres: dipLitres });
      return;
    }
    setWorkshopLevels((items) =>
      items.map((item) =>
        item.name === editingWorkshopName ? { ...item, current: dipLitres, expectedLitres: item.expectedLitres ?? item.current } : item,
      ),
    );
    if (dipLitres !== draft.current) {
      recordStockAdjustment({
        area: storageArea,
        product: draft.name,
        previousLitres: draft.current,
        newLitres: dipLitres,
        user: "Admin User",
        acknowledgement: `${department} dip current litre adjustment acknowledged.`,
      });
      setAdjustmentRegister(loadStockAdjustmentRegister());
    }
    setDraft({ ...draft, current: dipLitres, expectedLitres: draft.expectedLitres ?? draft.current });
    setDipping(false);
    setMessage(`${draft.name} tank dip recorded.`);
  }

  function acknowledgeWorkshopAdjustment() {
    if (!pendingWorkshopAdjustment) return;
    const type = pendingWorkshopAdjustment.type;
    setPendingWorkshopAdjustment(null);
    if (type === "edit") {
      saveWorkshopStock(true);
      return;
    }
    saveWorkshopDip(true);
  }

  function saveWorkshopRefill() {
    try {
      const source = loadBulkTanks().find(item => item.name === refillDraft.source);
      const destination = loadDepartmentStock().find(item => item.name === refillDraft.product);
      if (!source || !destination) throw new Error("Select the source bulk tank and destination compartment.");
      saveSiteStock(applyStockOperation(loadSiteStock(), { kind: "transfer", source: `bulk:${source.id}`, destination: `${department === "Field" ? "facility" : "workshop"}:${destination.id}`, litres: refillDraft.litres }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record refill."); return; }
    setRefilling(false);
    setMessage(`${refillDraft.product} refill recorded.`);
  }

  return (
    <section className="bulk-original-page">
      <header className="bulk-page-header">
        <div>
          <h2>{storageArea}</h2>
          <p>{department} oil stock separate from main bulk tanks</p>
        </div>
      </header>
      <section className="original-panel">
        <div className="section-heading-row">
          <div className="section-heading">
            <h3>{department} Oil Storage</h3>
            <span>Monitor {department.toLowerCase()} oils, coolant and waste oil</span>
          </div>
          <div className="button-row workshop-actions">
            <button className="primary-button add-delivery-button" type="button" onClick={addWorkshopCompartment}><Plus size={18} /> Add Oil Compartment</button>
            <button className="primary-button add-delivery-button" type="button" disabled={!workshopLevels.length} onClick={() => { setRefillDraft({ ...refillDraft, product: workshopLevels[0]?.name ?? "" }); setRefilling(true); setEditing(false); setDipping(false); }}><Plus size={18} /> Record Refill</button>
            <button className="primary-button add-delivery-button" type="button" disabled={!workshopLevels.length} onClick={() => openWorkshopDetails(draft)}><Edit2 size={18} /> Edit {department} Stock</button>
          </div>
        </div>
        {!workshopLevels.length && <p>No compartments yet. Select Add Oil Compartment to set up {department.toLowerCase()} stock.</p>}
        <div className="workshop-level-grid">
          {workshopLevels.map((tank) => (
            <OriginalTankCard
              key={tank.name}
              tank={{
                ...tank,
                percent: Math.round((tank.current / tank.capacity) * 100),
                tone: workshopTankTone(tank, alertSettings),
              }}
              actionLabel="View Details"
              onAction={() => openWorkshopDetails(tank)}
            />
          ))}
        </div>
      </section>
      <ReconciliationPanel
        title={`${storageArea} Reconciliation`}
        subtitle={`${department} expected stock compared with actual counts`}
        items={workshopReconciliationFromLevels(workshopLevels).map(item => ({ ...item, area: department === "Field" ? "Field" : item.area }))}
      />
      {message && <p className="success-banner">{message}</p>}
      <div className="panel table-panel">
        <div className="panel-title"><FileText size={20} /><h2>{department} Refill History</h2></div>
        <DataTable headers={["Date/time", "Product", "Source", "Target", "Litres", "Employee"]} rows={refillHistory} />
      </div>
      {(editing || refilling || dipping) && (
        <div ref={workshopDetailRef}>
      {editing && (
        <section className="detail-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>{department} Stock Details</h3>
              <span>Edit baseline stock levels or record a supervisor tank dip</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <div className="detail-grid">
            <article><span>Product</span><strong>{draft.name}</strong></article>
            <article><span>Expected</span><strong>{(draft.expectedLitres ?? draft.current).toLocaleString()} L</strong></article>
            <article><span>Actual</span><strong>{draft.current.toLocaleString()} L</strong></article>
            <article><span>Capacity</span><strong>{draft.capacity.toLocaleString()} L</strong></article>
          </div>
          <div className="settings-grid">
            <label>Product
              <select value={draft.name} onChange={(event) => {
                const selected = workshopLevels.find((item) => item.name === event.target.value) ?? draft;
                setDraft(selected);
                setEditingWorkshopName(selected.name);
                setDipLitres(selected.current);
              }}>
                {workshopLevels.map((item) => <option key={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label>Oil / fluid type<select value={draft.productId} onChange={event => setDraft({ ...draft, productId: event.target.value })}>{[...new Set([draft.productId, ...loadBulkTanks().map(tank => tank.productId)])].map(id => <option key={id} value={id}>{loadBulkTanks().find(tank => tank.productId === id)?.name ?? id}</option>)}</select></label>
            <label>Compartment name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label>Current litres
              <input type="number" value={draft.current} onChange={(event) => setDraft({ ...draft, current: Number(event.target.value) })} />
            </label>
            <label>Capacity
              <input type="number" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: Number(event.target.value) })} />
            </label>

          </div>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={() => saveWorkshopStock()}><Save size={18} /> Save</button>
            <button className="secondary-button" type="button" disabled={!editingWorkshopName} onClick={openWorkshopDip}>Record Dip</button>
            <button className="secondary-button danger-edit" type="button" disabled={!editingWorkshopName} onClick={removeWorkshopCompartment}>Remove Compartment</button>
            <button className="secondary-button" type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </section>
      )}
      {dipping && (
        <section className="detail-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>Record {department} Tank Dip</h3>
              <span>Compare supervisor dip against expected {department.toLowerCase()} stock</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setDipping(false)}>Cancel</button>
          </div>
          <div className="detail-grid">
            <article><span>Product</span><strong>{draft.name}</strong></article>
            <article><span>Expected</span><strong>{(draft.expectedLitres ?? draft.current).toLocaleString()} L</strong></article>
            <article><span>Current Actual</span><strong>{draft.current.toLocaleString()} L</strong></article>
            <article><span>Capacity</span><strong>{draft.capacity.toLocaleString()} L</strong></article>
          </div>
          <div className="inline-form-panel">
            <label>Actual Tank Dip Litres<input type="number" value={dipLitres} onChange={(event) => setDipLitres(Number(event.target.value))} /></label>
            <strong className={(draft.expectedLitres ?? draft.current) - dipLitres > 0 ? "unaccounted-warning" : "unaccounted-ok"}>
              Difference: {((draft.expectedLitres ?? draft.current) - dipLitres).toLocaleString()} L
            </strong>
            <button className="primary-button" type="button" onClick={() => saveWorkshopDip()}>Save Tank Dip</button>
          </div>
        </section>
      )}
      {refilling && (
        <section className="detail-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>Record Refill</h3>
              <span>Add {department.toLowerCase()} stock from a source bulk tank</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setRefilling(false)}>Cancel</button>
          </div>
          <div className="settings-grid">
            <label>Product
              <select value={refillDraft.product} onChange={(event) => setRefillDraft({ ...refillDraft, product: event.target.value })}>
                {workshopLevels.map((item) => <option key={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label>Litres added
              <input type="number" value={refillDraft.litres} onChange={(event) => setRefillDraft({ ...refillDraft, litres: Number(event.target.value) })} />
            </label>
            <label>Source bulk tank
              <select value={refillDraft.source} onChange={(event) => setRefillDraft({ ...refillDraft, source: event.target.value })}>
                {loadBulkTanks().map((tank) => <option key={tank.id}>{tank.name}</option>)}
              </select>
            </label>
            <label>Employee
              <input value={refillDraft.employee} onChange={(event) => setRefillDraft({ ...refillDraft, employee: event.target.value })} />
            </label>
          </div>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={saveWorkshopRefill}><Save size={18} /> Save Refill</button>
            <button className="secondary-button" type="button" onClick={() => setRefilling(false)}>Cancel</button>
          </div>
        </section>
      )}
        </div>
      )}
      {pendingWorkshopAdjustment && (
        <ManualAdjustmentWarning
          product={pendingWorkshopAdjustment.product}
          previousLitres={pendingWorkshopAdjustment.previousLitres}
          newLitres={pendingWorkshopAdjustment.newLitres}
          onCancel={() => setPendingWorkshopAdjustment(null)}
          onConfirm={acknowledgeWorkshopAdjustment}
        />
      )}
      <StockAdjustmentRegisterTable
        title={`${storageArea} Manual Adjustment Register`}
        rows={adjustmentRegister.filter((entry) => entry.area === storageArea)}
      />
    </section>
  );
}

export function ServiceTrucks() {
  const { branding } = useBranding();
  const alertCount = useLiveAlertCount();
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<"addTruck" | "editTruck" | "refill" | "addGroup" | "editGroup" | "removeGroup" | null>(null);
  const [trucks, setTrucksState] = useState<ServiceTruckRecord[]>(loadServiceTrucks);
  const [selectedTruckId, setSelectedTruckId] = useState("ST102");
  const selectedTruck = trucks.find((truck) => truck.truckId === selectedTruckId) ?? trucks[0];
  const truckOilGroups = selectedTruck?.oilGroups ?? [];
  const [truckDraft, setTruckDraft] = useState(selectedTruck);
  const emptyGroup: ServiceTruckOilGroup = { name: "New Oil Group", system: "Category", capacity: 1000, current: 0, tone: "yellow" };
  const [groupDraft, setGroupDraft] = useState<ServiceTruckOilGroup>(truckOilGroups[0] ?? emptyGroup);
  const [refillDraft, setRefillDraft] = useState({ group: truckOilGroups[0]?.name ?? "", litres: 250, source: "Fuel Farm" });
  const totalCapacity = truckOilGroups.reduce((sum, item) => sum + item.capacity, 0);
  const totalCurrent = truckOilGroups.reduce((sum, item) => sum + item.current, 0);
  const overall = totalCapacity ? Math.round((totalCurrent / totalCapacity) * 100) : 0;
  const fuelGroups = truckOilGroups.filter(isFuelGroup);
  const fuelCapacity = fuelGroups.reduce((sum, item) => sum + item.capacity, 0);
  const fuelCurrent = fuelGroups.reduce((sum, item) => sum + item.current, 0);
  const fuelPercent = fuelCapacity ? Math.round((fuelCurrent / fuelCapacity) * 100) : 0;
  const serviceAlertSettings = loadSystemAlertSettings();
  const fuelTone = serviceTruckLevelTone(fuelPercent, serviceAlertSettings);

  useEffect(() => {
    const refresh = () => setTrucksState(loadServiceTrucks());
    window.addEventListener("storage", refresh);
    window.addEventListener("titan-service-trucks-updated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("titan-service-trucks-updated", refresh);
    };
  }, []);

  function setTrucks(next: ServiceTruckRecord[]) {
    setTrucksState(next);
    saveServiceTrucks(next);
  }

  function openAction(nextAction: typeof action) {
    if (nextAction === "editTruck") setTruckDraft(selectedTruck);
    if (nextAction === "editGroup" || nextAction === "removeGroup") setGroupDraft(truckOilGroups[0] ?? emptyGroup);
    setAction(nextAction);
    setMessage("");
  }

  function saveTruck() {
    if (action === "addTruck") {
      if (trucks.some((truck) => truck.truckId === truckDraft.truckId)) {
        setMessage(`${truckDraft.truckId} already exists. Use a unique truck ID.`);
        return;
      }
      setTrucks([...trucks, truckDraft]);
      setSelectedTruckId(truckDraft.truckId);
      setMessage(`${truckDraft.truckId} added.`);
    } else {
      if (truckDraft.truckId !== selectedTruckId && trucks.some((truck) => truck.truckId === truckDraft.truckId)) {
        setMessage(`${truckDraft.truckId} already exists. Use a unique truck ID.`);
        return;
      }
      setTrucks(trucks.map((truck) => truck.truckId === selectedTruckId ? truckDraft : truck));
      setSelectedTruckId(truckDraft.truckId);
      setMessage(`${truckDraft.truckId} updated.`);
    }
    setAction(null);
  }

  function removeTruck() {
    if (!confirm(`Remove ${selectedTruck.truckId}?`)) return;
    const remaining = trucks.filter((truck) => truck.truckId !== selectedTruck.truckId);
    setTrucks(remaining);
    setSelectedTruckId(remaining[0]?.truckId ?? "");
    setMessage(`${selectedTruck.truckId} removed.`);
  }

  function saveGroup() {
    if (action === "addGroup") {
      setTrucks(trucks.map((truck) => truck.truckId === selectedTruckId ? { ...truck, oilGroups: [...truck.oilGroups, groupDraft] } : truck));
      setMessage(`${groupDraft.name} added.`);
    } else {
      setTrucks(trucks.map((truck) => truck.truckId === selectedTruckId ? { ...truck, oilGroups: truck.oilGroups.map((group) => group.name === groupDraft.name ? groupDraft : group) } : truck));
      setMessage(`${groupDraft.name} updated.`);
    }
    setAction(null);
  }

  function removeGroup() {
    if (!confirm(`Remove ${groupDraft.name}?`)) return;
    setTrucks(trucks.map((truck) => truck.truckId === selectedTruckId ? { ...truck, oilGroups: truck.oilGroups.filter((group) => group.name !== groupDraft.name) } : truck));
    setAction(null);
    setMessage(`${groupDraft.name} removed.`);
  }

  function saveRefill() {
    try {
      const source = loadBulkTanks().find(item => refillDraft.source === "Fuel Farm" ? item.productId === "diesel" : item.name === refillDraft.source);
      const truck = loadServiceTrucks().find(item => item.truckId === selectedTruck?.truckId);
      const index = truck?.oilGroups.findIndex(item => item.name === refillDraft.group) ?? -1;
      if (!source || !truck || index < 0) throw new Error("Select the source bulk tank and truck compartment.");
      saveSiteStock(applyStockOperation(loadSiteStock(), { kind: "transfer", source: `bulk:${source.id}`, destination: `truck:${truck.truckId}:${truck.oilGroups[index].id ?? truck.oilGroups[index].name}`, litres: refillDraft.litres }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record refill."); return; }
    setMessage(`${refillDraft.litres.toLocaleString()} L added to ${refillDraft.group} from ${refillDraft.source}.`);
    setAction(null);
  }

  return (
    <section className="service-original-page">
      <header className="bulk-page-header">
        <div>
          <h2>Service Trucks</h2>
          <p>Overview of operations and key metrics</p>
        </div>
        <div className="bulk-header-actions">
          <button className="date-button" type="button">26 Jun 2026</button>
          <button className="icon-alert-button" type="button"><Bell size={18} /><span>{alertCount}</span></button>
          <div className="admin-card"><UserRound size={19} /><div><strong>Admin User</strong><span>Administrator</span></div></div>
        </div>
      </header>

      <div className="service-original-grid">
        <aside className="service-truck-rail">
          <h3>Service Trucks</h3>
          <p>Manage service truck inventory and oil stock levels</p>
          <label>
            Select Truck
            <input defaultValue="" placeholder="Search trucks..." />
          </label>
          <div className="truck-picker">
            {trucks.map((truck) => (
              <button className={truck.truckId === selectedTruckId ? "selected" : ""} type="button" key={truck.truckId} onClick={() => setSelectedTruckId(truck.truckId)}>
                <TruckListThumb image={truck.imageUrl || branding.serviceTruckImage} />
                <strong>{truck.truckId}<small>{truck.registration}</small></strong>
                <em>{truck.status}</em>
              </button>
            ))}
          </div>
          <div className="selected-truck-card">
            <ServiceTruckImage image={selectedTruck?.imageUrl || branding.serviceTruckImage} />
            <dl className="truck-detail-list">
              <div><dt>Truck ID</dt><dd>{selectedTruck.truckId}</dd></div>
              <div><dt>Registration</dt><dd>{selectedTruck.registration}</dd></div>
              <div><dt>Fuel Capacity</dt><dd>{fuelCapacity.toLocaleString()} L</dd></div>
              <div><dt>Status</dt><dd><span className="active-pill">{selectedTruck.status}</span></dd></div>
              <div><dt>Last Refill</dt><dd>{selectedTruck.lastRefill}</dd></div>
              <div><dt>Odometer</dt><dd>{selectedTruck.odometer}</dd></div>
            </dl>
          </div>
        </aside>

        <section className="original-panel service-stock-panel">
          <div className="service-stock-header">
            <div className="section-heading">
              <h3>{selectedTruck.truckId} - Oil Groups & Stock</h3>
              <span>Service truck grouped oils and capacity</span>
            </div>
            <div className="service-actions">
              <button className="secondary-button" type="button" onClick={() => { setTruckDraft({ truckId: "ST105", registration: "TSS-105", status: "Active", capacity: 5100, lastRefill: "Not refilled", odometer: "0 km", imageUrl: "", oilGroups: [] }); openAction("addTruck"); }}><Plus size={18} /> Add Truck</button>
              <button className="secondary-button" type="button" onClick={() => openAction("editTruck")}><Edit2 size={18} /> Edit Truck</button>
              <button className="secondary-button" type="button" onClick={removeTruck}>Remove Truck</button>
              <button className="primary-button" type="button" onClick={() => openAction("refill")}>Refill Truck</button>
              <button className="secondary-button" type="button" onClick={() => { setGroupDraft({ name: "New Oil Group", system: "Category", capacity: 1000, current: 0, tone: "yellow" }); openAction("addGroup"); }}><Plus size={18} /> Add Oil Group</button>
              <button className="secondary-button" type="button" onClick={() => openAction("removeGroup")}>Remove Oil Group</button>
            </div>
          </div>
          <div className="stock-tabs">
            <button className="active" type="button">Stock Overview</button>
            <button type="button">Refill History</button>
          </div>
          <div className="original-table-wrap service-table-frame">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Group / Oil Type</th>
                  <th>Capacity (L)</th>
                  <th>Current Level (L)</th>
                  <th>Percentage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {truckOilGroups.map((group) => {
                  const percent = Math.round((group.current / group.capacity) * 100);
                  const tone = serviceTruckLevelTone(percent, serviceAlertSettings);
                  return (
                    <tr key={group.name}>
                      <td><strong>{group.name}</strong><span>{group.system}</span></td>
                      <td>{group.capacity.toLocaleString()}</td>
                      <td>{group.current.toLocaleString()}</td>
                      <td>
                        <div className="percent-cell">
                          <span className={`mini-bar ${tone}`}><i style={{ width: `${percent}%` }} /></span>
                          <b>{percent}%</b>
                        </div>
                      </td>
                      <td><button className="edit-button" type="button" onClick={() => { setGroupDraft(group); setAction("editGroup"); }}><Edit2 size={14} /> Edit</button></td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td><strong>Total Capacity</strong></td>
                  <td>{totalCapacity.toLocaleString()} L</td>
                  <td><strong>Total Current</strong><br />{totalCurrent.toLocaleString()} L</td>
                  <td><strong>Overall</strong><br /><em>{overall}%</em></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <section className="service-summary-cards">
            <article><span>Fuel Storage Capacity</span><strong>{fuelCapacity.toLocaleString()} L</strong></article>
            <article><span>Fuel Current Level</span><strong>{fuelCurrent.toLocaleString()} L</strong></article>
            <article><span>Fuel Percentage</span><strong className={fuelTone === "green" ? "good" : fuelTone === "yellow" ? "warn" : "bad"}>{fuelPercent}%</strong></article>
            <article><span>Low Stock Alerts</span><strong className="bad">0</strong></article>
          </section>
          {message && <p className="success-banner">{message}</p>}
          {action && (
            <section className="detail-panel">
              <div className="section-heading-row">
                <div className="section-heading">
                  <h3>{actionLabel(action)}</h3>
                  <span>Local demo update for service truck stock</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => setAction(null)}>Cancel</button>
              </div>
              {(action === "addTruck" || action === "editTruck") && (
                <>
                  <div className="settings-grid">
                    <label>Truck ID<input value={truckDraft.truckId} onChange={(event) => setTruckDraft({ ...truckDraft, truckId: event.target.value })} /></label>
                    <label>Registration<input value={truckDraft.registration} onChange={(event) => setTruckDraft({ ...truckDraft, registration: event.target.value })} /></label>
                    <label>Capacity<input type="number" value={truckDraft.capacity} onChange={(event) => setTruckDraft({ ...truckDraft, capacity: Number(event.target.value) })} /></label>
                    <label>Status<select value={truckDraft.status} onChange={(event) => setTruckDraft({ ...truckDraft, status: event.target.value })}><option>Active</option><option>Refilling</option><option>Standby</option><option>Maintenance</option></select></label>
                    <label>Truck Image
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const image = await fileToDataUrl(file, ["image/png", "image/jpeg", "image/webp"]);
                        setTruckDraft({ ...truckDraft, imageUrl: image });
                        setMessage("Service truck image preview updated.");
                      }} />
                    </label>
                    <div className="brand-preview truck-preview">{truckDraft.imageUrl ? <img src={truckDraft.imageUrl} alt="Truck preview" /> : <span>No truck image selected</span>}</div>
                    <label>Notes<input defaultValue="Service truck note" /></label>
                  </div>
                  <div className="button-row detail-actions"><button className="primary-button" type="button" onClick={saveTruck}><Save size={18} /> Save</button><button className="secondary-button" type="button" onClick={() => setAction(null)}>Cancel</button></div>
                </>
              )}
              {(action === "addGroup" || action === "editGroup" || action === "removeGroup") && (
                <>
                  <div className="settings-grid">
                    <label>Group name<input value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} /></label>
                    <label>Oil type<input value={groupDraft.system} onChange={(event) => setGroupDraft({ ...groupDraft, system: event.target.value })} /></label>
                    <label>Capacity<input type="number" value={groupDraft.capacity} onChange={(event) => setGroupDraft({ ...groupDraft, capacity: Number(event.target.value) })} /></label>
                    <label>Current level<input type="number" value={groupDraft.current} onChange={(event) => setGroupDraft({ ...groupDraft, current: Number(event.target.value) })} /></label>
                    <label>Low stock alert<input type="number" defaultValue={30} /></label>
                  </div>
                  <div className="button-row detail-actions">
                    {action === "removeGroup" ? <button className="primary-button" type="button" onClick={removeGroup}>Confirm Remove</button> : <button className="primary-button" type="button" onClick={saveGroup}><Save size={18} /> Save</button>}
                    <button className="secondary-button" type="button" onClick={() => setAction(null)}>Cancel</button>
                  </div>
                </>
              )}
              {action === "refill" && (
                <>
                  <div className="settings-grid">
                    <label>Oil group<select value={refillDraft.group} onChange={(event) => setRefillDraft({ ...refillDraft, group: event.target.value })}>{truckOilGroups.map((group) => <option key={group.name}>{group.name}</option>)}</select></label>
                    <label>Source bulk tank<select value={refillDraft.source} onChange={(event) => setRefillDraft({ ...refillDraft, source: event.target.value })}><option value="Fuel Farm">Fuel Farm (diesel)</option>{loadBulkTanks().map(tank => <option key={tank.id}>{tank.name}</option>)}</select></label>
                    <label>Litres added<input type="number" value={refillDraft.litres} onChange={(event) => setRefillDraft({ ...refillDraft, litres: Number(event.target.value) })} /></label>
                  </div>
                  <div className="button-row detail-actions"><button className="primary-button" type="button" onClick={saveRefill}><Save size={18} /> Save Refill</button><button className="secondary-button" type="button" onClick={() => setAction(null)}>Cancel</button></div>
                </>
              )}
            </section>
          )}
        </section>
      </div>
    </section>
  );
}

function actionLabel(action: "addTruck" | "editTruck" | "refill" | "addGroup" | "editGroup" | "removeGroup") {
  const labels = {
    addTruck: "Add Truck",
    editTruck: "Edit Truck",
    refill: "Refill Truck",
    addGroup: "Add Oil Group",
    editGroup: "Edit Oil Group",
    removeGroup: "Remove Oil Group",
  };
  return labels[action];
}

function ManualAdjustmentWarning({
  product,
  previousLitres,
  newLitres,
  onCancel,
  onConfirm,
}: {
  product: string;
  previousLitres: number;
  newLitres: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card stock-adjustment-warning">
        <div className="section-heading">
          <h3>Manual Litre Adjustment Warning</h3>
          <span>This change will be captured in the stock adjustment register.</span>
        </div>
        <div className="detail-grid">
          <article><span>Compartment</span><strong>{product}</strong></article>
          <article><span>Previous litres</span><strong>{previousLitres.toLocaleString()} L</strong></article>
          <article><span>New litres</span><strong>{newLitres.toLocaleString()} L</strong></article>
          <article className={newLitres - previousLitres < 0 ? "warning-card" : "good-card"}>
            <span>Difference</span>
            <strong>{newLitres - previousLitres > 0 ? "+" : ""}{(newLitres - previousLitres).toLocaleString()} L</strong>
          </article>
        </div>
        <p className="modal-copy">
          Current litres should normally change through refills, deliveries, transfers or tank dips. Acknowledge this manual change only if the adjustment is required and can be accounted for.
        </p>
        <div className="button-row detail-actions">
          <button className="primary-button" type="button" onClick={onConfirm}>Acknowledge & Save</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </section>
    </div>
  );
}

function StockAdjustmentRegisterTable({ title, rows }: { title: string; rows: StockAdjustmentRegisterEntry[] }) {
  return (
    <section className="original-panel">
      <div className="section-heading">
        <h3>{title}</h3>
        <span>Manual current-litre changes requiring acknowledgement</span>
      </div>
      <DataTable
        headers={["Date/time", "Product", "Previous", "New", "Difference", "User", "Acknowledgement"]}
        rows={rows.map((entry) => [
          entry.dateTime,
          entry.product,
          `${entry.previousLitres.toLocaleString()} L`,
          `${entry.newLitres.toLocaleString()} L`,
          `${entry.difference > 0 ? "+" : ""}${entry.difference.toLocaleString()} L`,
          entry.user,
          entry.acknowledgement,
        ])}
        emptyMessage="No manual litre adjustments recorded."
      />
    </section>
  );
}

function isFuelGroup(group: ServiceTruckOilGroup) {
  const productId = group.productId?.toLowerCase() ?? "";
  const name = group.name.toLowerCase();
  const system = group.system.toLowerCase();
  return productId === "diesel" || name.includes("diesel") || name.includes("fuel") || system.includes("fuel");
}

function serviceTruckLevelTone(percent: number, alertSettings: SystemAlertSettings) {
  return storageLevelTone(percent, alertSettings.serviceTruckLowLevelPercent, alertSettings.serviceTruckCriticalLevelPercent);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function safeWorksheetName(value: string) {
  const cleaned = value.replace(/[\\/?*[\]:]/g, " ").trim() || "Fuel Source";
  return cleaned.slice(0, 31);
}

function excelStyles() {
  return `
    <Styles>
      <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" ss:Color="#FFFFFF"/><Interior ss:Color="#111923" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Subtitle"><Font ss:Bold="1" ss:Color="#FFC20E"/><Interior ss:Color="#111923" ss:Pattern="Solid"/></Style>
      <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#111827"/><Interior ss:Color="#FFC20E" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
      <Style ss:ID="Cell"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D1D5DB"/></Borders></Style>
      <Style ss:ID="Total"><Font ss:Bold="1"/><Interior ss:Color="#E8EDF3" ss:Pattern="Solid"/></Style>
    </Styles>
  `;
}

function buildExcelWorkbook(worksheets: string[]) {
  return `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      ${excelStyles()}
      ${worksheets.join("")}
    </Workbook>`;
}

function excelCell(value: string | number, style = "Cell") {
  const isNumber = typeof value === "number" && Number.isFinite(value);
  return `<Cell ss:StyleID="${style}"><Data ss:Type="${isNumber ? "Number" : "String"}">${escapeHtml(String(value))}</Data></Cell>`;
}

function buildSimpleReportWorksheet(
  sheetName: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const dataRows = rows.length
    ? rows.map((row) => `<Row>${row.map((cell) => excelCell(cell)).join("")}</Row>`).join("")
    : `<Row><Cell ss:StyleID="Cell" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">No report data available.</Data></Cell></Row>`;
  return `
    <Worksheet ss:Name="${escapeHtml(safeWorksheetName(sheetName))}">
      <Table>
        ${headers.map(() => '<Column ss:Width="150"/>').join("")}
        <Row><Cell ss:StyleID="Title" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeHtml(title)}</Data></Cell></Row>
        <Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="${headers.length - 1}"><Data ss:Type="String">${escapeHtml(subtitle)}</Data></Cell></Row>
        <Row>${headers.map((header) => excelCell(header, "Header")).join("")}</Row>
        ${dataRows}
      </Table>
    </Worksheet>
  `;
}

function buildFuelSheetWorksheet(source: string, rows: ReturnType<typeof buildSubmittedDailyFuelSheetSummaryRows>, date: string) {
  const totalFuel = rows.reduce((sum, row) => sum + row.fuelUsed, 0);
  const employeeGroups = new Map<string, typeof rows>();
  rows.forEach((row) => {
    employeeGroups.set(row.employee, [...(employeeGroups.get(row.employee) ?? []), row]);
  });
  const dataRows = rows.length
    ? Array.from(employeeGroups.entries()).map(([employee, employeeRows], groupIndex) => {
      const employeeTotal = employeeRows.reduce((sum, row) => sum + row.fuelUsed, 0);
      const assetRows = employeeRows.map((row) => `
        <Row>
          <Cell ss:StyleID="Cell"><Data ss:Type="String">${escapeHtml(row.assetNumber)}</Data></Cell>
          <Cell ss:StyleID="Cell"><Data ss:Type="${row.smuHours ? "Number" : "String"}">${row.smuHours || "-"}</Data></Cell>
          <Cell ss:StyleID="Cell"><Data ss:Type="Number">${row.fuelUsed}</Data></Cell>
        </Row>
      `).join("");
      return `
        ${groupIndex ? '<Row><Cell ss:MergeAcross="2"><Data ss:Type="String"></Data></Cell></Row>' : ""}
        <Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="2"><Data ss:Type="String">Employee - ${escapeHtml(employee)}</Data></Cell></Row>
        <Row>
          <Cell ss:StyleID="Header"><Data ss:Type="String">Asset Number</Data></Cell>
          <Cell ss:StyleID="Header"><Data ss:Type="String">SMU</Data></Cell>
          <Cell ss:StyleID="Header"><Data ss:Type="String">Fuel Used</Data></Cell>
        </Row>
        ${assetRows}
        <Row>
          <Cell ss:StyleID="Total"><Data ss:Type="String">Employee Total</Data></Cell>
          <Cell ss:StyleID="Total"><Data ss:Type="String"></Data></Cell>
          <Cell ss:StyleID="Total"><Data ss:Type="Number">${employeeTotal}</Data></Cell>
        </Row>
      `;
    }).join("")
    : '<Row><Cell ss:StyleID="Cell" ss:MergeAcross="2"><Data ss:Type="String">No submitted fuel sheets available.</Data></Cell></Row>';
  return `
    <Worksheet ss:Name="${escapeHtml(safeWorksheetName(source))}">
      <Table>
        <Column ss:Width="150"/>
        <Column ss:Width="90"/>
        <Column ss:Width="110"/>
        <Row><Cell ss:StyleID="Title" ss:MergeAcross="2"><Data ss:Type="String">Titan Safety Systems - Daily Fuel Sheet</Data></Cell></Row>
        <Row><Cell ss:StyleID="Subtitle" ss:MergeAcross="2"><Data ss:Type="String">${escapeHtml(source)} - ${escapeHtml(date)}</Data></Cell></Row>
        ${dataRows}
        <Row>
          <Cell ss:StyleID="Total"><Data ss:Type="String">Total</Data></Cell>
          <Cell ss:StyleID="Total"><Data ss:Type="String"></Data></Cell>
          <Cell ss:StyleID="Total"><Data ss:Type="Number">${totalFuel}</Data></Cell>
        </Row>
      </Table>
    </Worksheet>
  `;
}

type BulkAssetDraft = {
  templateId: string;
  assetNumbers: string;
  make: string;
  model: string;
  type: string;
  fleet: string;
  department: string;
  status: EditableAsset["status"];
  notes: string;
};

function defaultBulkAssetDraft(): BulkAssetDraft {
  return {
    templateId: "",
    assetNumbers: "",
    make: "",
    model: "",
    type: "",
    fleet: "",
    department: "",
    status: "Active",
    notes: "",
  };
}

const assetGroupOrder = ["Haul Trucks", "Excavators", "Dozers", "Drills", "Water Carts", "Service Trucks / Support", "Other Assets"];

function assetGroupLabel(type: string) {
  const value = type.trim().toLowerCase();
  if (!value) return "Other Assets";
  if (value.includes("service") || value.includes("support") || value.includes("light")) return "Service Trucks / Support";
  if (value.includes("haul") || value.includes("truck")) return "Haul Trucks";
  if (value.includes("excavator")) return "Excavators";
  if (value.includes("dozer")) return "Dozers";
  if (value.includes("drill")) return "Drills";
  if (value.includes("water")) return "Water Carts";
  return `${type}s`;
}

function groupAssetsByType(assets: EditableAsset[]) {
  const groups = new Map<string, EditableAsset[]>();
  assets.forEach((asset) => {
    const label = assetGroupLabel(asset.type);
    groups.set(label, [...(groups.get(label) ?? []), asset]);
  });
  return Array.from(groups.entries()).sort(([left], [right]) => {
    const leftIndex = assetGroupOrder.indexOf(left);
    const rightIndex = assetGroupOrder.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? assetGroupOrder.length : leftIndex) - (rightIndex === -1 ? assetGroupOrder.length : rightIndex);
    }
    return left.localeCompare(right);
  });
}

export function FleetManagement() {
  const [assetRecords, setAssetRecords] = useState<EditableAsset[]>(loadAssets);
  const [templates, setTemplates] = useState<OilTemplate[]>(loadOilTemplates);
  const [activeTab, setActiveTab] = useState<"assets" | "templates">("assets");
  const [editingAsset, setEditingAsset] = useState<EditableAsset | null>(null);
  const [editingAssetKey, setEditingAssetKey] = useState("");
  const [assetMode, setAssetMode] = useState<"add" | "edit" | null>(null);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState<BulkAssetDraft>(defaultBulkAssetDraft);
  const [collapsedAssetGroups, setCollapsedAssetGroups] = useState<string[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<OilTemplate | null>(null);
  const [templateMode, setTemplateMode] = useState<"add" | "edit" | null>(null);
  const [message, setMessage] = useState("");

  function persistAssets(next: EditableAsset[]) {
    setAssetRecords(next);
    saveAssets(next);
  }

  function persistTemplates(next: OilTemplate[]) {
    setTemplates(next);
    saveOilTemplates(next);
  }

  function compartmentsFromTemplate(template: OilTemplate, assetNumber: string): AssetOilConfiguration[] {
    return template.compartments.map((item) => ({
      id: `${assetNumber}-${item.compartment.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      compartment: item.compartment,
      product: item.product,
      capacity: item.capacity,
      active: item.active,
    }));
  }

  function saveAsset() {
    if (!editingAsset) return;
    const payload = defaultAssetQrPayload(editingAsset.assetNumber);
    const assetToSave = editingAsset.qrPayload === payload && editingAsset.qrCode
      ? editingAsset
      : { ...editingAsset, qrPayload: payload, qrCode: generateAssetQrCode(payload) };
    if (assetMode === "add") {
      if (assetRecords.some((asset) => asset.assetNumber === assetToSave.assetNumber)) {
        setMessage(`${assetToSave.assetNumber} already exists. Use a unique asset number.`);
        return;
      }
      persistAssets([...assetRecords, assetToSave]);
      setMessage(`${assetToSave.assetNumber} added.`);
    } else {
      persistAssets(assetRecords.map((asset) => asset.assetNumber === editingAssetKey ? assetToSave : asset));
      setMessage(`${assetToSave.assetNumber} updated.`);
    }
    setEditingAsset(null);
    setEditingAssetKey("");
    setAssetMode(null);
  }

  function openAddAsset() {
    const assetNumber = `NEW-${assetRecords.length + 1}`;
    const payload = defaultAssetQrPayload(assetNumber);
    setEditingAsset({
      assetNumber,
      make: "",
      model: "",
      type: "",
      serialNumber: "",
      fleet: "",
      department: "",
      status: "Active",
      notes: "",
      image: "",
      qrPayload: payload,
      qrCode: generateAssetQrCode(payload),
      oilConfiguration: [],
    });
    setEditingAssetKey("");
    setAssetMode("add");
    setMessage("");
  }

  function openEditAsset(asset: EditableAsset) {
    setEditingAsset(asset);
    setEditingAssetKey(asset.assetNumber);
    setAssetMode("edit");
    setMessage("");
  }

  function openBulkAdd() {
    setBulkDraft(defaultBulkAssetDraft());
    setBulkAddOpen(true);
    setEditingAsset(null);
    setAssetMode(null);
    setMessage("");
  }

  function applyBulkTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setBulkDraft({ ...bulkDraft, templateId });
      return;
    }
    setBulkDraft({
      ...bulkDraft,
      templateId,
      make: template.make,
      model: template.model,
      type: template.type,
      fleet: bulkDraft.fleet || template.type,
    });
  }

  function parseBulkAssetNumbers(value: string) {
    const tokens = value
      .split(/[\n,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const assetNumbers: string[] = [];
    const invalid: string[] = [];

    tokens.forEach((token) => {
      const rangeMatch = token.match(/^([A-Za-z-]+\d+)\s*-\s*([A-Za-z-]+\d+)$/);
      if (!rangeMatch) {
        assetNumbers.push(token.toUpperCase());
        return;
      }

      const start = splitAssetNumber(rangeMatch[1]);
      const end = splitAssetNumber(rangeMatch[2]);
      if (!start || !end || start.prefix !== end.prefix || end.number < start.number) {
        invalid.push(token);
        return;
      }

      for (let number = start.number; number <= end.number; number += 1) {
        assetNumbers.push(`${start.prefix}${String(number).padStart(start.width, "0")}`.toUpperCase());
      }
    });

    return {
      assetNumbers: Array.from(new Set(assetNumbers)),
      invalid,
    };
  }

  function splitAssetNumber(assetNumber: string) {
    const match = assetNumber.match(/^(.*?)(\d+)$/);
    if (!match) return null;
    return {
      prefix: match[1].toUpperCase(),
      number: Number(match[2]),
      width: match[2].length,
    };
  }

  function createBulkAssets() {
    const { assetNumbers, invalid } = parseBulkAssetNumbers(bulkDraft.assetNumbers);
    if (invalid.length) {
      setMessage(`Could not read asset range: ${invalid.join(", ")}.`);
      return;
    }
    if (!assetNumbers.length) {
      setMessage("Enter at least one asset number or range.");
      return;
    }
    if (!bulkDraft.make || !bulkDraft.model || !bulkDraft.type) {
      setMessage("Make, model and type are required for bulk assets.");
      return;
    }
    const existingAssetNumbers = new Set(assetRecords.map((asset) => asset.assetNumber.toLowerCase()));
    const duplicates = assetNumbers.filter((assetNumber) => existingAssetNumbers.has(assetNumber.toLowerCase()));
    if (duplicates.length) {
      setMessage(`These assets already exist: ${duplicates.join(", ")}.`);
      return;
    }

    const template = templates.find((item) => item.id === bulkDraft.templateId);
    const newAssets = assetNumbers.map((assetNumber) => {
      const payload = defaultAssetQrPayload(assetNumber);
      return {
        assetNumber,
        make: bulkDraft.make,
        model: bulkDraft.model,
        type: bulkDraft.type,
        serialNumber: `SN-${assetNumber.replace(/[^A-Z0-9]/gi, "")}`,
        fleet: bulkDraft.fleet,
        department: bulkDraft.department,
        status: bulkDraft.status,
        notes: bulkDraft.notes,
        image: "",
        qrPayload: payload,
        qrCode: generateAssetQrCode(payload),
        oilConfiguration: template ? compartmentsFromTemplate(template, assetNumber) : [],
      };
    });

    persistAssets([...assetRecords, ...newAssets]);
    setBulkAddOpen(false);
    setBulkDraft(defaultBulkAssetDraft());
    setMessage(`${newAssets.length} assets added.`);
  }

  function generateQrForDraft() {
    if (!editingAsset) return;
    const payload = defaultAssetQrPayload(editingAsset.assetNumber);
    setEditingAsset({ ...editingAsset, qrPayload: payload, qrCode: generateAssetQrCode(payload) });
    setMessage(`QR code generated for ${editingAsset.assetNumber}.`);
  }

  function printQrForDraft() {
    if (!editingAsset) return;
    const payload = defaultAssetQrPayload(editingAsset.assetNumber);
    const qrCode = editingAsset.qrCode || generateAssetQrCode(payload);
    if (!editingAsset.qrCode || editingAsset.qrPayload !== payload) {
      setEditingAsset({ ...editingAsset, qrPayload: payload, qrCode });
    }
    const safeAssetNumber = escapeHtml(editingAsset.assetNumber || "Unassigned Asset");
    const safeMakeModel = escapeHtml(`${editingAsset.make} ${editingAsset.model}`.trim() || "Asset details");
    const safeType = escapeHtml(editingAsset.type || "Asset");
    const safeSerial = escapeHtml(editingAsset.serialNumber || "-");
    const safePayload = escapeHtml(payload);
    const printWindow = window.open("", "asset-qr-print", "width=620,height=760");
    if (!printWindow) {
      setMessage("Allow pop-ups to print the QR code.");
      return;
    }
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${safeAssetNumber} QR Code</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              font-family: Arial, sans-serif;
              color: #05080c;
              background: #ffffff;
            }
            .label {
              width: 420px;
              min-height: 560px;
              margin: 0 auto;
              padding: 26px;
              border: 3px solid #05080c;
              display: grid;
              gap: 18px;
              align-content: start;
            }
            .brand {
              color: #05080c;
              font-size: 15px;
              font-weight: 900;
              letter-spacing: 1.2px;
              text-transform: uppercase;
            }
            h1 {
              margin: 0;
              font-size: 42px;
              line-height: 1;
            }
            img {
              width: 280px;
              height: 280px;
              justify-self: center;
              image-rendering: crisp-edges;
            }
            dl {
              display: grid;
              gap: 8px;
              margin: 0;
              font-size: 17px;
            }
            div.row {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              border-bottom: 1px solid #c7ced8;
              padding-bottom: 6px;
            }
            dt {
              font-weight: 700;
              color: #4b5563;
            }
            dd {
              margin: 0;
              font-weight: 900;
              text-align: right;
            }
            .payload {
              margin-top: 6px;
              padding: 10px;
              font-size: 12px;
              overflow-wrap: anywhere;
              background: #eef2f7;
              border: 1px solid #c7ced8;
            }
            @media print {
              body { padding: 0; }
              .label { margin: 0; border-width: 2px; page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <section class="label">
            <div class="brand">Titan Safety Systems</div>
            <h1>${safeAssetNumber}</h1>
            <img src="${qrCode}" alt="Asset QR Code" />
            <dl>
              <div class="row"><dt>Machine</dt><dd>${safeMakeModel}</dd></div>
              <div class="row"><dt>Type</dt><dd>${safeType}</dd></div>
              <div class="row"><dt>Serial</dt><dd>${safeSerial}</dd></div>
            </dl>
            <div class="payload">${safePayload}</div>
          </section>
          <script>
            window.addEventListener("load", () => {
              window.focus();
              setTimeout(() => window.print(), 150);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setMessage(`Print label opened for ${editingAsset.assetNumber}.`);
  }

  function applyTemplate(templateId: string) {
    if (!editingAsset) return;
    if (templateId === "blank") {
      setEditingAsset({ ...editingAsset, make: "", model: "", type: "", oilConfiguration: [] });
      setMessage("Blank asset selected. Add oil configuration manually or create a new template.");
      return;
    }
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setEditingAsset({
      ...editingAsset,
      make: template.make,
      model: template.model,
      type: template.type,
      oilConfiguration: compartmentsFromTemplate(template, editingAsset.assetNumber),
    });
    setMessage(`Oil configuration loaded from template: ${template.make} ${template.model}`);
  }

  function checkTemplateForDraft(nextAsset: EditableAsset) {
    const template = findOilTemplate(nextAsset.make, nextAsset.model, templates);
    if (!template) {
      setEditingAsset(nextAsset);
      if (nextAsset.make && nextAsset.model) setMessage("No oil template found. Add oil configuration manually or create a new template.");
      return;
    }
    setEditingAsset({
      ...nextAsset,
      type: template.type,
      oilConfiguration: compartmentsFromTemplate(template, nextAsset.assetNumber),
    });
    setMessage(`Oil configuration loaded from template: ${template.make} ${template.model}`);
  }

  function updateAssetDraft(patch: Partial<EditableAsset>) {
    if (!editingAsset) return;
    const next = { ...editingAsset, ...patch };
    if (patch.make !== undefined || patch.model !== undefined) {
      checkTemplateForDraft(next);
      return;
    }
    setEditingAsset(next);
  }

  function addOilType() {
    if (!editingAsset) return;
    const nextOil: AssetOilConfiguration = {
      id: `${editingAsset.assetNumber}-oil-${Date.now()}`,
      compartment: "New Compartment",
      product: "New Oil Type",
      capacity: 0,
      active: true,
    };
    setEditingAsset({ ...editingAsset, oilConfiguration: [...editingAsset.oilConfiguration, nextOil] });
  }

  function updateOilType(id: string, patch: Partial<AssetOilConfiguration>) {
    if (!editingAsset) return;
    setEditingAsset({
      ...editingAsset,
      oilConfiguration: editingAsset.oilConfiguration.map((oil) => oil.id === id ? { ...oil, ...patch } : oil),
    });
  }

  function removeOilType(id: string) {
    if (!editingAsset) return;
    setEditingAsset({ ...editingAsset, oilConfiguration: editingAsset.oilConfiguration.filter((oil) => oil.id !== id) });
  }

  function toggleAssetGroup(groupName: string) {
    setCollapsedAssetGroups((current) =>
      current.includes(groupName)
        ? current.filter((item) => item !== groupName)
        : [...current, groupName],
    );
  }

  const groupedAssets = groupAssetsByType(assetRecords);

  return (
    <section className="module-page">
      <ModuleTitle
        kicker="Operations"
        title="Asset Management"
        action={(
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={openBulkAdd}><Plus size={18} /> Bulk Add Assets</button>
            <button className="primary-button" type="button" onClick={openAddAsset}><Plus size={18} /> Add Asset</button>
          </div>
        )}
      />
      {message && <p className="success-banner">{message}</p>}
      <div className="stock-tabs asset-tabs">
        <button className={activeTab === "assets" ? "active" : ""} type="button" onClick={() => setActiveTab("assets")}>Assets</button>
        <button className={activeTab === "templates" ? "active" : ""} type="button" onClick={() => setActiveTab("templates")}>Oil Templates</button>
      </div>
      {bulkAddOpen && (
        <section className="detail-panel asset-bulk-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>Bulk Add Assets</h3>
              <span>Create multiple matching machines with unique QR codes</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setBulkAddOpen(false)}>Cancel</button>
          </div>
          <label className="template-picker">Use Oil Template
            <select value={bulkDraft.templateId} onChange={(event) => applyBulkTemplate(event.target.value)}>
              <option value="">No template</option>
              {templates.map((template) => <option value={template.id} key={template.id}>{template.make} {template.model}</option>)}
            </select>
          </label>
          <div className="settings-grid asset-settings-grid">
            <label>Make<input value={bulkDraft.make} onChange={(event) => setBulkDraft({ ...bulkDraft, make: event.target.value })} /></label>
            <label>Model<input value={bulkDraft.model} onChange={(event) => setBulkDraft({ ...bulkDraft, model: event.target.value })} /></label>
            <label>Type<input value={bulkDraft.type} onChange={(event) => setBulkDraft({ ...bulkDraft, type: event.target.value })} /></label>
            <label>Fleet / group<input value={bulkDraft.fleet} onChange={(event) => setBulkDraft({ ...bulkDraft, fleet: event.target.value })} /></label>
            <label>Department<input value={bulkDraft.department} onChange={(event) => setBulkDraft({ ...bulkDraft, department: event.target.value })} /></label>
            <label>Status<select value={bulkDraft.status} onChange={(event) => setBulkDraft({ ...bulkDraft, status: event.target.value as EditableAsset["status"] })}><option>Active</option><option>Standby</option><option>In Service</option><option>Maintenance</option></select></label>
          </div>
          <label className="bulk-asset-number-field">Asset numbers
            <textarea
              value={bulkDraft.assetNumbers}
              onChange={(event) => setBulkDraft({ ...bulkDraft, assetNumbers: event.target.value })}
              placeholder={"RD4830\nRD4831\nRD4832\n\nOr use a range: RD4830-RD4845"}
            />
          </label>
          <label className="bulk-asset-number-field">Notes
            <textarea
              value={bulkDraft.notes}
              onChange={(event) => setBulkDraft({ ...bulkDraft, notes: event.target.value })}
              placeholder="Optional notes applied to all created assets"
            />
          </label>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={createBulkAssets}><Save size={18} /> Create Assets</button>
            <button className="secondary-button" type="button" onClick={() => setBulkDraft(defaultBulkAssetDraft())}>Clear</button>
          </div>
        </section>
      )}
      {activeTab === "assets" && (
        <div className="asset-group-stack">
          {groupedAssets.length === 0 && (
            <section className="empty-state-panel">
              <QrCode size={34} />
              <h3>No assets added yet</h3>
              <p>Add assets one at a time or use Bulk Add Assets to load your trial fleet.</p>
            </section>
          )}
          {groupedAssets.map(([groupName, assets]) => {
            const collapsed = collapsedAssetGroups.includes(groupName);
            const activeCount = assets.filter((asset) => asset.status === "Active").length;
            const standbyCount = assets.filter((asset) => asset.status === "Standby").length;
            const maintenanceCount = assets.filter((asset) => asset.status === "Maintenance").length;
            return (
              <section className="asset-group-panel" key={groupName}>
                <button className="asset-group-header" type="button" onClick={() => toggleAssetGroup(groupName)} aria-expanded={!collapsed}>
                  <div>
                    <span>{collapsed ? "+" : "-"}</span>
                    <strong>{groupName}</strong>
                  </div>
                  <em>{assets.length} assets</em>
                  <small>{activeCount} Active</small>
                  <small>{standbyCount} Standby</small>
                  <small>{maintenanceCount} Maintenance</small>
                </button>
                {!collapsed && (
                  <DataTable
                    headers={["Asset Number", "Type", "Make / Model", "Fleet", "Status", "QR", "Actions"]}
                    rows={assets.map((asset) => [
                      asset.assetNumber,
                      asset.type,
                      `${asset.make} ${asset.model}`,
                      asset.fleet,
                      asset.status,
                      <span key={`${asset.assetNumber}-qr`} className="asset-qr-thumb">{asset.qrCode ? <img src={asset.qrCode} alt="" /> : <QrCode size={18} />}</span>,
                      <button key={`${asset.assetNumber}-edit`} className="edit-button" type="button" onClick={() => openEditAsset(asset)}><Edit2 size={14} /> Edit</button>,
                    ])}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
      {activeTab === "templates" && (
        <OilTemplatesTab
          templates={templates}
          editingTemplate={editingTemplate}
          templateMode={templateMode}
          onAdd={() => {
            setEditingTemplate(defaultTemplateDraft());
            setTemplateMode("add");
            setMessage("");
          }}
          onEdit={(template) => {
            setEditingTemplate(template);
            setTemplateMode("edit");
            setMessage("");
          }}
          onDelete={(template) => {
            persistTemplates(templates.filter((item) => item.id !== template.id));
            setMessage(`${template.make} ${template.model} template deleted.`);
          }}
          onDraft={setEditingTemplate}
          onSave={() => {
            if (!editingTemplate) return;
            const templateToSave = { ...editingTemplate, lastUpdated: new Date().toLocaleDateString() };
            if (templateMode === "add") persistTemplates([...templates, { ...templateToSave, id: `template-${Date.now()}` }]);
            else persistTemplates(templates.map((item) => item.id === templateToSave.id ? templateToSave : item));
            setEditingTemplate(null);
            setTemplateMode(null);
            setMessage(`${templateToSave.make} ${templateToSave.model} template saved.`);
          }}
          onCancel={() => {
            setEditingTemplate(null);
            setTemplateMode(null);
          }}
        />
      )}
      {editingAsset && (
        <section className="detail-panel asset-edit-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>{assetMode === "add" ? "Add Asset" : "Edit Asset"}</h3>
              <span>Update asset details, QR code and oil configuration</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => { setEditingAsset(null); setAssetMode(null); }}>Cancel</button>
          </div>
          <label className="template-picker">Use Oil Template
            <select defaultValue="" onChange={(event) => applyTemplate(event.target.value)}>
              <option value="" disabled>Select template...</option>
              {templates.map((template) => <option value={template.id} key={template.id}>{template.make} {template.model}</option>)}
              <option value="blank">Blank Asset</option>
            </select>
          </label>
          <div className="asset-qr-panel">
            <div className="asset-qr-preview">
              {editingAsset.qrCode ? <img src={editingAsset.qrCode} alt="Assigned asset QR code" /> : <QrCode size={44} />}
            </div>
            <div>
              <span>Assigned QR Code</span>
              <strong>{editingAsset.qrPayload || "No QR code assigned"}</strong>
              <div className="asset-qr-actions">
                <button className="secondary-button" type="button" onClick={generateQrForDraft}><QrCode size={16} /> Generate QR Code</button>
                <button className="secondary-button" type="button" onClick={printQrForDraft}><Printer size={16} /> Print QR Code</button>
              </div>
            </div>
          </div>
          <div className="settings-grid asset-settings-grid">
            <label>Asset number<input value={editingAsset.assetNumber} onChange={(event) => updateAssetDraft({ assetNumber: event.target.value })} /></label>
            <label>Make<input value={editingAsset.make} onChange={(event) => updateAssetDraft({ make: event.target.value })} /></label>
            <label>Model<input value={editingAsset.model} onChange={(event) => updateAssetDraft({ model: event.target.value })} /></label>
            <label>Type<input value={editingAsset.type} onChange={(event) => updateAssetDraft({ type: event.target.value })} /></label>
            <label>Serial number<input value={editingAsset.serialNumber} onChange={(event) => updateAssetDraft({ serialNumber: event.target.value })} /></label>
            <label>Fleet / group<input value={editingAsset.fleet} onChange={(event) => updateAssetDraft({ fleet: event.target.value })} /></label>
            <label>Department<input value={editingAsset.department} onChange={(event) => updateAssetDraft({ department: event.target.value })} /></label>
            <label>Status<select value={editingAsset.status} onChange={(event) => updateAssetDraft({ status: event.target.value as EditableAsset["status"] })}><option>Active</option><option>Standby</option><option>In Service</option><option>Maintenance</option></select></label>
            <label>Image<input value={editingAsset.image} placeholder="Image URL or saved image data" onChange={(event) => updateAssetDraft({ image: event.target.value })} /></label>
            <label>Notes<input value={editingAsset.notes} onChange={(event) => updateAssetDraft({ notes: event.target.value })} /></label>
          </div>
          <div className="section-heading-row oil-config-heading">
            <div className="section-heading">
              <h3>Oil Configuration</h3>
              <span>Add, edit or remove oil types for this asset</span>
            </div>
            <button className="secondary-button" type="button" onClick={addOilType}><Plus size={18} /> Add Oil Type</button>
          </div>
          <div className="oil-config-list">
            {editingAsset.oilConfiguration.map((oil) => (
              <article className="oil-config-card" key={oil.id}>
                <label>Compartment / System<input value={oil.compartment} onChange={(event) => updateOilType(oil.id, { compartment: event.target.value })} /></label>
                <label>Product / Oil Type<input value={oil.product} onChange={(event) => updateOilType(oil.id, { product: event.target.value })} /></label>
                <label>Capacity<input type="number" value={oil.capacity} onChange={(event) => updateOilType(oil.id, { capacity: Number(event.target.value) })} /></label>
                <label>Active<select value={oil.active ? "Active" : "Inactive"} onChange={(event) => updateOilType(oil.id, { active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
                <button className="secondary-button" type="button" onClick={() => removeOilType(oil.id)}>Remove</button>
              </article>
            ))}
          </div>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={saveAsset}><Save size={18} /> Save Asset</button>
            <button className="secondary-button" type="button" onClick={() => { setEditingAsset(null); setAssetMode(null); }}>Cancel</button>
          </div>
        </section>
      )}
    </section>
  );
}

export function EmployeeManagement() {
  const [users, setUsers] = useState<ManagedUser[]>(loadUsers);
  const [mode, setMode] = useState<"view" | "edit" | "add" | null>(null);
  const [draft, setDraft] = useState<ManagedUser>(defaultEmployeeDraft());
  const [message, setMessage] = useState("");
  const currentUser = loadCurrentUser();
  const canAdminister = currentUser?.role === "Administrator";
  const trucks = loadServiceTrucks();

  function persistUsers(next: ManagedUser[]) {
    setUsers(next);
    saveUsers(next);
  }

  function openAdd() {
    if (!canAdminister) return;
    setDraft(defaultEmployeeDraft());
    setMode("add");
    setMessage("");
  }

  function openUser(user: ManagedUser, nextMode: "view" | "edit") {
    setDraft(user);
    setMode(nextMode);
    setMessage("");
  }

  function saveEmployee() {
    if (!canAdminister) return;
    if (mode === "add") {
      persistUsers([...users, { ...draft, id: `user-${Date.now()}` }]);
      setMessage(`${draft.fullName} added.`);
    } else {
      persistUsers(users.map((user) => user.id === draft.id ? draft : user));
      setMessage(`${draft.fullName} updated.`);
    }
    setMode(null);
  }

  function disableUser(user: ManagedUser) {
    if (!canAdminister) return;
    persistUsers(users.map((item) => item.id === user.id ? { ...item, status: "Inactive" } : item));
    setMessage(`${user.fullName} disabled.`);
  }

  function resetPin() {
    if (!canAdminister) return;
    setDraft({ ...draft, pin: "0000", mustResetPin: true });
    setMessage("PIN reset to 0000. Employee must create a new PIN next login.");
  }

  return (
    <section className="module-page">
      <ModuleTitle kicker="Management" title="Employee Management" action={<button className="primary-button" type="button" onClick={openAdd}><Plus size={18} /> Add Employee</button>} />
      {message && <p className="success-banner">{message}</p>}
      <DataTable
        headers={["Full Name", "Employee No.", "Crew", "Position", "Assigned Truck", "Role", "Status", "Actions"]}
        rows={users.map((user) => [
          user.fullName,
          user.employeeNumber,
          user.crew,
          user.position,
          user.assignedServiceTruck,
          user.role,
          <span key={`${user.id}-status`} className={`status-pill ${user.status === "Active" ? "good" : user.status === "On Leave" ? "warn" : "bad"}`}>{user.status}</span>,
          <div key={`${user.id}-actions`} className="table-actions">
            <button className="edit-button" type="button" onClick={() => openUser(user, "view")}>View</button>
            <button className="edit-button" type="button" onClick={() => openUser(user, "edit")}>Edit</button>
            <button className="edit-button danger-edit" type="button" onClick={() => disableUser(user)}>Disable</button>
          </div>,
        ])}
      />
      {mode && (
        <section className="detail-panel employee-edit-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>{mode === "add" ? "Add Employee" : mode === "view" ? "View Employee" : "Edit Employee"}</h3>
              <span>Role, status and PIN settings control portal access</span>
            </div>
            <button className="secondary-button" type="button" onClick={() => setMode(null)}>Cancel</button>
          </div>
          <div className="employee-profile-summary">
            <div className="profile-avatar large">{draft.profilePicture ? <img src={draft.profilePicture} alt="" /> : <UserRound size={28} />}</div>
            <dl>
              <div><dt>Name</dt><dd>{draft.fullName}</dd></div>
              <div><dt>Role</dt><dd>{draft.role}</dd></div>
              <div><dt>Crew</dt><dd>{draft.crew}</dd></div>
              <div><dt>Position</dt><dd>{draft.position}</dd></div>
              <div><dt>Assigned Truck</dt><dd>{draft.assignedServiceTruck}</dd></div>
              <div><dt>Last Login</dt><dd>{draft.lastLogin}</dd></div>
            </dl>
          </div>
          <div className="settings-grid employee-settings-grid">
            <label>Full Name<input value={draft.fullName} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} /></label>
            <label>Employee Number<input value={draft.employeeNumber} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })} /></label>
            <label>Email<input value={draft.email} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label>Phone<input value={draft.phone} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
            <label>Crew<input value={draft.crew} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, crew: event.target.value })} /></label>
            <label>Position<input value={draft.position} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, position: event.target.value })} /></label>
            <label>Employee Portal Role<select value={draft.employeeRole} disabled={mode === "view"} onChange={(event) => {
              const employeeRole = event.target.value as EmployeePortalRole;
              const permissions = employeeRole === "Serviceperson" || employeeRole === "Fuel Operator"
                ? ["service-entry", "refills", "fuel-schedule", "daily-sheet"]
                : ["service-entry", "refills", "daily-sheet"];
              setDraft({ ...draft, employeeRole, permissions });
            }}><option>Serviceperson</option><option>Fuel Operator</option><option>Fitter</option><option>Supervisor</option><option>Admin</option><option>Employee</option></select></label>
            <label>Assigned Service Truck<select value={draft.assignedServiceTruck} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, assignedServiceTruck: event.target.value, assignedServiceTruckId: event.target.value === "-" ? null : event.target.value })}><option>-</option>{trucks.map((truck) => <option key={truck.truckId}>{truck.truckId}</option>)}</select></label>
            <label>Role<select value={draft.role} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}><option>Administrator</option><option>Supervisor</option><option>Employee</option></select></label>
            <label>PIN<input value={draft.pin} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, pin: event.target.value })} /></label>
            <label>Status<select value={draft.status} disabled={mode === "view"} onChange={(event) => setDraft({ ...draft, status: event.target.value as UserStatus })}><option>Active</option><option>Inactive</option><option>On Leave</option></select></label>
          </div>
          <div className="button-row detail-actions">
            {mode !== "view" && <button className="primary-button" type="button" onClick={saveEmployee}><Save size={18} /> Save</button>}
            {mode === "edit" && canAdminister && <button className="secondary-button" type="button" onClick={resetPin}>Reset PIN</button>}
            <button className="secondary-button" type="button" onClick={() => setMode(null)}>Cancel</button>
          </div>
        </section>
      )}
    </section>
  );
}

function OilTemplatesTab({
  templates,
  editingTemplate,
  templateMode,
  onAdd,
  onEdit,
  onDelete,
  onDraft,
  onSave,
  onCancel,
}: {
  templates: OilTemplate[];
  editingTemplate: OilTemplate | null;
  templateMode: "add" | "edit" | null;
  onAdd: () => void;
  onEdit: (template: OilTemplate) => void;
  onDelete: (template: OilTemplate) => void;
  onDraft: (template: OilTemplate) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function updateTemplate(patch: Partial<OilTemplate>) {
    if (!editingTemplate) return;
    onDraft({ ...editingTemplate, ...patch });
  }

  function updateCompartment(id: string, patch: Partial<OilTemplateCompartment>) {
    if (!editingTemplate) return;
    onDraft({
      ...editingTemplate,
      compartments: editingTemplate.compartments.map((item) => item.id === id ? { ...item, ...patch } : item),
    });
  }

  function addCompartment() {
    if (!editingTemplate) return;
    onDraft({
      ...editingTemplate,
      compartments: [
        ...editingTemplate.compartments,
        { id: `compartment-${Date.now()}`, compartment: "New Compartment", product: "Oil Type", capacity: 0, active: true },
      ],
    });
  }

  function removeCompartment(id: string) {
    if (!editingTemplate) return;
    onDraft({ ...editingTemplate, compartments: editingTemplate.compartments.filter((item) => item.id !== id) });
  }

  return (
    <section className="asset-template-tab">
      <div className="section-heading-row">
        <div className="section-heading">
          <h3>Oil Template Library</h3>
          <span>Manage pre-population templates by make and model</span>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}><Plus size={18} /> Add Template</button>
      </div>
      <DataTable
        headers={["Make", "Model", "Type", "Compartments", "Last Updated", "Actions"]}
        rows={templates.map((template) => [
          template.make,
          template.model,
          template.type,
          template.compartments.length,
          template.lastUpdated,
          <div className="table-actions" key={`${template.id}-actions`}>
            <button className="edit-button" type="button" onClick={() => onEdit(template)}>Edit</button>
            <button className="edit-button danger-edit" type="button" onClick={() => onDelete(template)}>Delete</button>
          </div>,
        ])}
      />
      {editingTemplate && (
        <section className="detail-panel asset-edit-panel">
          <div className="section-heading-row">
            <div className="section-heading">
              <h3>{templateMode === "add" ? "Add Oil Template" : "Edit Oil Template"}</h3>
              <span>Templates pre-populate asset-specific oil configuration</span>
            </div>
            <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          </div>
          <div className="settings-grid asset-settings-grid">
            <label>Make<input value={editingTemplate.make} onChange={(event) => updateTemplate({ make: event.target.value })} /></label>
            <label>Model<input value={editingTemplate.model} onChange={(event) => updateTemplate({ model: event.target.value })} /></label>
            <label>Type<input value={editingTemplate.type} onChange={(event) => updateTemplate({ type: event.target.value })} /></label>
            <label>Notes<input value={editingTemplate.notes} onChange={(event) => updateTemplate({ notes: event.target.value })} /></label>
          </div>
          <div className="section-heading-row oil-config-heading">
            <div className="section-heading">
              <h3>Template Compartments</h3>
              <span>Compartment, product, capacity and active status only</span>
            </div>
            <button className="secondary-button" type="button" onClick={addCompartment}><Plus size={18} /> Add Compartment</button>
          </div>
          <div className="oil-config-list">
            {editingTemplate.compartments.map((compartment) => (
              <article className="oil-config-card template-compartment-card" key={compartment.id}>
                <label>Compartment / System<input value={compartment.compartment} onChange={(event) => updateCompartment(compartment.id, { compartment: event.target.value })} /></label>
                <label>Product / Oil Type<input value={compartment.product} onChange={(event) => updateCompartment(compartment.id, { product: event.target.value })} /></label>
                <label>Capacity<input type="number" value={compartment.capacity} onChange={(event) => updateCompartment(compartment.id, { capacity: Number(event.target.value) })} /></label>
                <label>Active<select value={compartment.active ? "Active" : "Inactive"} onChange={(event) => updateCompartment(compartment.id, { active: event.target.value === "Active" })}><option>Active</option><option>Inactive</option></select></label>
                <button className="secondary-button" type="button" onClick={() => removeCompartment(compartment.id)}>Remove</button>
              </article>
            ))}
          </div>
          <div className="button-row detail-actions">
            <button className="primary-button" type="button" onClick={onSave}><Save size={18} /> Save Template</button>
            <button className="secondary-button" type="button">Apply Template Update to Existing Assets</button>
            <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          </div>
        </section>
      )}
    </section>
  );
}

function defaultTemplateDraft(): OilTemplate {
  return {
    id: "new-template",
    make: "",
    model: "",
    type: "",
    notes: "",
    lastUpdated: new Date().toLocaleDateString(),
    compartments: [],
  };
}

function defaultEmployeeDraft(): ManagedUser {
  return {
    id: "new-user",
    fullName: "",
    employeeNumber: "",
    email: "",
    phone: "",
    crew: "",
    position: "",
    assignedServiceTruck: "-",
    assignedServiceTruckId: null,
    employeeRole: "Employee",
    permissions: ["service-entry", "refills", "daily-sheet"],
    role: "Employee",
    pin: "0000",
    status: "Active",
    profilePicture: "",
    lastLogin: "Not logged in",
    mustResetPin: false,
  };
}

export function Reports() {
  const reportToday = new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  const reportTodayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  const [summaryFilters, setSummaryFilters] = useState({ dateIso: reportTodayIso, date: activityPeriod(new Date().toISOString())!.date, shift: "All" });
  const [filters, setFilters] = useState({ date: reportToday, employee: "All", asset: "", product: "", shift: "All", crew: "All" });
  const [dailyFuelFilters, setDailyFuelFilters] = useState({ dateIso: reportTodayIso, date: reportToday, shift: "All", fuelSource: "All" });
  const [exportedFuelSheets, setExportedFuelSheets] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(readSharedItem("titan-daily-fuel-sheet-export-history-v1") ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [message, setMessage] = useState("");
  const [, setReportRevision] = useState(0);
  const reportEmployees = loadUsers().filter((user) => user.role === "Employee" && user.status === "Active");
  const reconciliation = buildDailyReconciliation();
  const unaccountedOilRows = reconciliation.filter((item) => item.difference !== 0);
  const fuelSheetRows = buildDailyFuelSheetRows();
  const submittedFuelSheetRows = buildSubmittedDailyFuelSheetSummaryRows({
    date: dailyFuelFilters.date,
    shift: dailyFuelFilters.shift,
    fuelSource: dailyFuelFilters.fuelSource,
  });
  const sourceFilteredFuelSheetRows = buildSubmittedDailyFuelSheetSummaryRows({
    date: dailyFuelFilters.date,
    shift: dailyFuelFilters.shift,
  });
  const dailyFuelSourceOptions = ["All", ...Array.from(new Set(sourceFilteredFuelSheetRows.map((row) => row.fuelSource)))];
  const dailyFuelExportKey = `${dailyFuelFilters.date}|${dailyFuelFilters.shift}|${dailyFuelFilters.fuelSource}`;
  const dailyFuelExportedAt = exportedFuelSheets[dailyFuelExportKey];
  const dailyFuelExportHistoryRows = Object.entries(exportedFuelSheets).map(([key, exportedAt]) => {
    const [date, shift, fuelSource] = key.split("|");
    return [date, "Daily Fuel Sheet Report", shift, fuelSource, exportedAt, "Exported"];
  });
  const summary = buildDailySummary(summaryFilters.date, summaryFilters.shift);
  const reportHistory = buildReportHistory().filter((report) => {
    const employeeMatch = filters.employee === "All" || report.employee === filters.employee;
    const assetMatch = !filters.asset || report.asset.toLowerCase().includes(filters.asset.toLowerCase()) || report.name.toLowerCase().includes(filters.asset.toLowerCase());
    const productMatch = !filters.product || report.product.toLowerCase().includes(filters.product.toLowerCase());
    const shiftMatch = filters.shift === "All" || report.shift === filters.shift;
    const crewMatch = filters.crew === "All" || report.crew === filters.crew;
    return report.date === filters.date && employeeMatch && assetMatch && productMatch && shiftMatch && crewMatch;
  });

  useEffect(() => {
    const refreshReports = () => setReportRevision((revision) => revision + 1);
    [
      "storage",
      "titan-fuel-submissions-updated",
      "titan-service-entries-updated",
      "titan-bulk-tanks-updated",
      "titan-workshop-stock-updated",
      "titan-assets-updated",
      "titan-users-updated",
    ].forEach((eventName) => window.addEventListener(eventName, refreshReports));
    return () => {
      [
        "storage",
        "titan-fuel-submissions-updated",
        "titan-service-entries-updated",
        "titan-bulk-tanks-updated",
        "titan-workshop-stock-updated",
        "titan-assets-updated",
        "titan-users-updated",
      ].forEach((eventName) => window.removeEventListener(eventName, refreshReports));
    };
  }, []);

  function exportCsv() {
    const headers = ["Date", "Product", "Expected", "Actual", "Difference", "Status", "Supervisor Notes"];
    const rows = reconciliation.map((item) => [filters.date, item.product, item.expected, item.actual, item.difference, item.status, item.supervisorNotes]);
    downloadReport("daily-reconciliation.csv", reportRowsToCsv(headers, rows), "text/csv;charset=utf-8");
    setMessage("CSV export generated.");
  }

  function exportExcel() {
    const groups = new Map<string, typeof submittedFuelSheetRows>();
    submittedFuelSheetRows.forEach((row) => {
      groups.set(row.fuelSource, [...(groups.get(row.fuelSource) ?? []), row]);
    });
    const sources = Array.from(groups.entries());
    const worksheets = sources.length
      ? sources.map(([source, rows]) => buildFuelSheetWorksheet(source, rows, filters.date)).join("")
      : buildFuelSheetWorksheet("No Submitted Sheets", [], filters.date);
    const workbook = buildExcelWorkbook([worksheets]);
    downloadReport("daily-fuel-sheet.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
    const exportedAt = new Date().toLocaleString();
    const nextExportedFuelSheets = { ...exportedFuelSheets, [dailyFuelExportKey]: exportedAt };
    setExportedFuelSheets(nextExportedFuelSheets);
    writeSharedItem("titan-daily-fuel-sheet-export-history-v1", JSON.stringify(nextExportedFuelSheets));
    setMessage("Daily Fuel Sheet Excel export generated.");
  }

  function exportDailyReconciliationExcel() {
    const headers = ["Area", "Product", "Expected", "Actual", "Difference", "Status", "Supervisor Notes"];
    const rows = reconciliation.map((item) => [item.area, item.product, item.expected, item.actual, item.difference, item.status, item.supervisorNotes]);
    const workbook = buildExcelWorkbook([
      buildSimpleReportWorksheet("Daily Reconciliation", "Titan Safety Systems - Daily Reconciliation Report", filters.date, headers, rows),
    ]);
    downloadReport("daily-reconciliation-report.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
    setMessage("Daily Reconciliation Excel export generated.");
  }

  function exportEmployeeSubmissionExcel() {
    const headers = ["Employee", "Asset Number", "SMU", "Fuel Added", "Submission Time", "Status"];
    const rows = fuelSheetRows.map((row) => [row.employee, row.assetNumber, row.smuHours || "-", row.fuelAdded, row.submissionTime, row.status]);
    const workbook = buildExcelWorkbook([
      buildSimpleReportWorksheet("Employee Submissions", "Titan Safety Systems - Employee Submission Report", filters.date, headers, rows),
    ]);
    downloadReport("employee-submission-report.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
    setMessage("Employee Submission Excel export generated.");
  }

  function exportWorkshopUsageExcel() {
    const headers = ["Product", "Expected", "Actual", "Difference", "Status", "Supervisor Notes"];
    const rows = reconciliation
      .filter((item) => item.area === "Workshop Storage")
      .map((item) => [item.product, item.expected, item.actual, item.difference, item.status, item.supervisorNotes]);
    const workbook = buildExcelWorkbook([
      buildSimpleReportWorksheet("Workshop Usage", "Titan Safety Systems - Workshop Usage Report", filters.date, headers, rows),
    ]);
    downloadReport("workshop-usage-report.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
    setMessage("Workshop Usage Excel export generated.");
  }

  function exportBulkTankUsageExcel() {
    const headers = ["Product", "Expected", "Actual", "Difference", "Status", "Supervisor Notes"];
    const rows = reconciliation
      .filter((item) => item.area === "Bulk Storage")
      .map((item) => [item.product, item.expected, item.actual, item.difference, item.status, item.supervisorNotes]);
    const workbook = buildExcelWorkbook([
      buildSimpleReportWorksheet("Bulk Tank Usage", "Titan Safety Systems - Bulk Tank Usage Report", filters.date, headers, rows),
    ]);
    downloadReport("bulk-tank-usage-report.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
    setMessage("Bulk Tank Usage Excel export generated.");
  }

  function exportPdf() {
    const headers = ["Date", "Employee", "Asset", "Fuel Added (L)", "Status"];
    const rows = fuelSheetRows.map((row) => [row.date, row.employee, row.assetNumber, row.fuelAdded, row.status]);
    const htmlRows = [headers, ...rows].map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
    downloadReport("daily-fuel-sheet.html", `<h1>Daily Fuel Sheet</h1><table border="1" cellspacing="0" cellpadding="6">${htmlRows}</table>`, "text/html;charset=utf-8");
    setMessage("PDF-ready report generated as printable HTML.");
  }

  return (
    <section className="module-page reports-centre">
      <ModuleTitle
        kicker="Management"
        title="Reports"
        action={(
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={exportCsv}><Download size={18} /> Export CSV</button>
            <button className="secondary-button" type="button" onClick={exportPdf}><FileText size={18} /> Export to PDF</button>
          </div>
        )}
      />
      {message && <p className="success-banner">{message}</p>}

      <section className="report-dashboard-grid">
        <ReportMetric label="Selected Period Fuel Used" value={`${summary.fuelUsed.toLocaleString()} L`} />
        <ReportMetric label="Selected Period Oil Used" value={`${summary.oilUsed.toLocaleString()} L`} />
        <ReportMetric label="Bulk Variance" value={`${summary.unaccountedBulkOil.toLocaleString()} L`} tone={summary.unaccountedBulkOil ? "bad" : "good"} />
        <ReportMetric label="Workshop Variance" value={`${summary.unaccountedWorkshopOil.toLocaleString()} L`} tone={summary.unaccountedWorkshopOil ? "bad" : "good"} />
        <ReportMetric label="Contributors Still to Submit" value={summary.employeesOutstanding.toString()} tone={summary.employeesOutstanding ? "warn" : "good"} />
      </section>

      <section className="original-panel">
        <div className="section-heading-row">
          <div className="section-heading">
            <h3>Daily Fuel Sheet Export</h3>
            <span>Select any submitted date, shift and fuel source before downloading.</span>
          </div>
          <span className={`status-pill ${dailyFuelExportedAt ? "good" : "warn"}`}>
            {dailyFuelExportedAt ? `Exported ${dailyFuelExportedAt}` : "Ready / Not Exported"}
          </span>
        </div>
        <div className="settings-grid report-filter-grid">
          <label>Date
            <input
              type="date"
              value={dailyFuelFilters.dateIso}
              onChange={(event) => {
                const date = reportDateFromIso(event.target.value);
                setDailyFuelFilters({ ...dailyFuelFilters, dateIso: event.target.value, date, fuelSource: "All" });
                setFilters({ ...filters, date });
              }}
            />
          </label>
          <label>Shift
            <select value={dailyFuelFilters.shift} onChange={(event) => setDailyFuelFilters({ ...dailyFuelFilters, shift: event.target.value, fuelSource: "All" })}>
              <option>All</option>
              <option>Day Shift</option>
              <option>Night Shift</option>
            </select>
          </label>
          <label>Fuel Source
            <select value={dailyFuelFilters.fuelSource} onChange={(event) => setDailyFuelFilters({ ...dailyFuelFilters, fuelSource: event.target.value })}>
              {dailyFuelSourceOptions.map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>
        </div>
        <div className="daily-summary-grid">
          <ReportMetric label="Selected Date" value={dailyFuelFilters.date} />
          <ReportMetric label="Submitted Rows" value={submittedFuelSheetRows.length.toString()} tone={submittedFuelSheetRows.length ? "good" : "warn"} />
          <ReportMetric label="Fuel Total" value={`${submittedFuelSheetRows.reduce((sum, row) => sum + row.fuelUsed, 0).toLocaleString()} L`} />
        </div>
        <div className="report-export-footer">
          <button className="report-export-button" type="button" onClick={exportExcel}>
            <Download size={15} />
            Export to Excel
          </button>
        </div>
      </section>

      <section className="report-grid">
        {[
          { name: "Daily Reconciliation Report", detail: "Download daily stock variance as Excel", action: exportDailyReconciliationExcel },
          { name: "Employee Submission Report", detail: "Download employee submissions as Excel", action: exportEmployeeSubmissionExcel },
          { name: "Workshop Usage Report", detail: "Download workshop usage as Excel", action: exportWorkshopUsageExcel },
          { name: "Bulk Tank Usage Report", detail: "Download bulk tank usage as Excel", action: exportBulkTankUsageExcel },
        ].map((report) => (
            <article className="report-card" key={report.name}>
              <FileText size={28} />
              <strong>{report.name}</strong>
              <span>{report.detail}</span>
              <button className="report-export-button" type="button" onClick={report.action}>
                <Download size={15} />
                Export to Excel
              </button>
            </article>
        ))}
      </section>

      <ReconciliationPanel
        title="Daily Stock Reconciliation"
        subtitle="Expected stock compared with actual tank dips"
        items={reconciliation}
      />

      <section className="original-panel">
        <div className="section-heading">
          <h3>Unaccounted Oil Report</h3>
          <span>Automatically generated variance report for supervisor review</span>
        </div>
        <DataTable
          headers={["Date", "Product", "Expected", "Actual", "Difference", "Status", "Supervisor Notes"]}
          emptyMessage="No unaccounted oil recorded from live tank dips."
          rows={unaccountedOilRows.map((item) => [
            filters.date,
            item.product,
            `${item.expected.toLocaleString()} L`,
            `${item.actual.toLocaleString()} L`,
            <VarianceValue key={`${item.product}-variance`} item={item} />,
            <span key={`${item.product}-status`} className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>,
            item.supervisorNotes,
          ])}
        />
      </section>

      <section className="original-panel">
        <div className="section-heading-row">
          <div className="section-heading">
            <h3>Automatic Daily Summary</h3>
            <span>Live activity from saved entries for {summaryFilters.date} · {summaryFilters.shift === "All" ? "All shifts" : summaryFilters.shift}</span>
          </div>
        </div>
        <div className="settings-grid" data-local-preference>
          <label>Summary date<input type="date" value={summaryFilters.dateIso} onInput={event => { const value = event.currentTarget.value; if (value) setSummaryFilters(previous => ({ ...previous, dateIso: value, date: reportDateFromIso(value) })); }} onChange={event => { const value = event.target.value; if (value) setSummaryFilters(previous => ({ ...previous, dateIso: value, date: reportDateFromIso(value) })); }} /></label>
          <label>Summary shift<select value={summaryFilters.shift} onChange={event => setSummaryFilters({ ...summaryFilters, shift: event.target.value })}><option>All</option><option>Day Shift</option><option>Night Shift</option></select></label>
        </div>
        <p>Includes saved activity, even before daily-sheet submission. Day: 6 am–6 pm; Night: remaining hours of the selected calendar date (Brisbane time). Refill and delivery counts use recorded movement history; opening balances and tank dips are excluded.</p>
        {summary.unassignedShiftRecords > 0 && <p>{summary.unassignedShiftRecords} older records have no shift: included in All shifts only.</p>}
        <div className="daily-summary-grid">
          <ReportMetric label="Fuel Used" value={`${summary.fuelUsed.toLocaleString()} L`} />
          <ReportMetric label="Oil Used" value={`${summary.oilUsed.toLocaleString()} L`} />
          <ReportMetric label="Machines Fuelled" value={summary.machinesFuelled.toString()} />
          <ReportMetric label="Service Trucks Refilled" value={summary.serviceTrucksRefilled.toString()} />
          <ReportMetric label="Bulk Deliveries" value={summary.bulkDeliveries.toString()} />
          <ReportMetric label="Workshop Refills" value={summary.workshopRefills.toString()} />
          <ReportMetric label="Machines Serviced" value={summary.machinesServiced.toString()} />
          <ReportMetric label="Coolant Used" value={`${summary.coolantUsed.toLocaleString()} L`} />
          <ReportMetric label="Field Refills" value={summary.fieldRefills.toString()} />
          <ReportMetric label="Light Vehicle Refills" value={summary.lightVehicleRefills.toString()} />
          <ReportMetric label="Employees Submitted" value={summary.employeesSubmitted.toString()} tone="good" />
          <ReportMetric label="Contributors Still to Submit" value={summary.employeesOutstanding.toString()} tone={summary.employeesOutstanding ? "warn" : "good"} />
        </div>
        <p>Submitted counts contributors whose saved entries in this period are all submitted. It does not infer attendance or missing employees.</p>
        <DataTable headers={["Time", "Activity", "Department", "Location", "Product", "Litres", "Recorded by"]} emptyMessage="No deliveries or refills recorded for this period." rows={summary.movements.map(row => [new Date(row.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane" }), row.type, row.department, row.location, row.product, row.litres.toLocaleString(), row.employee])} />
      </section>

      <section className="original-panel">
        <div className="section-heading">
          <h3>Daily Fuel Sheet</h3>
          <span>Submitted shift sheets only for the selected report period</span>
        </div>
        <DataTable
          headers={["Fuel Source", "Employee", "Asset Number", "SMU", "Fuel Used"]}
          rows={submittedFuelSheetRows.map((row) => [row.fuelSource, row.employee, row.assetNumber, row.smuHours ? row.smuHours.toLocaleString() : "-", `${row.fuelUsed.toLocaleString()} L`])}
          emptyMessage="No submitted fuel sheets found for the selected date, shift and source."
        />
      </section>

      <section className="original-panel">
        <div className="section-heading">
          <h3>Daily Fuel Sheet Export History</h3>
          <span>Previously downloaded fuel sheet periods</span>
        </div>
        <DataTable
          headers={["Date", "Report", "Shift", "Fuel Source", "Last Exported", "Status"]}
          rows={dailyFuelExportHistoryRows}
          emptyMessage="No Daily Fuel Sheet exports recorded yet."
        />
      </section>

      <section className="original-panel">
        <div className="section-heading">
          <h3>Report History</h3>
          <span>Stored reports with operational filters</span>
        </div>
        <div className="settings-grid report-filter-grid">
          <label>Date<input value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
          <label>Employee<select value={filters.employee} onChange={(event) => setFilters({ ...filters, employee: event.target.value })}><option>All</option>{reportEmployees.map((employee) => <option key={employee.id}>{employee.fullName}</option>)}</select></label>
          <label>Asset<input placeholder="Asset or report" value={filters.asset} onChange={(event) => setFilters({ ...filters, asset: event.target.value })} /></label>
          <label>Product<input placeholder="Product" value={filters.product} onChange={(event) => setFilters({ ...filters, product: event.target.value })} /></label>
          <label>Shift<select value={filters.shift} onChange={(event) => setFilters({ ...filters, shift: event.target.value })}><option>All</option><option>Day Shift</option><option>Night Shift</option></select></label>
          <label>Crew<select value={filters.crew} onChange={(event) => setFilters({ ...filters, crew: event.target.value })}><option>All</option><option>A Crew</option><option>B Crew</option></select></label>
        </div>
        <DataTable
          headers={["Date", "Report", "Employee", "Asset", "Product", "Shift", "Crew", "Status"]}
          rows={reportHistory.map((report) => [report.date, report.name, report.employee, report.asset, report.product, report.shift, report.crew, report.status])}
        />
      </section>
    </section>
  );
}

function ReconciliationPanel({ title, subtitle, items }: { title: string; subtitle: string; items: ReconciliationItem[] }) {
  return (
    <section className="original-panel reconciliation-panel">
      <div className="section-heading">
        <h3>{title}</h3>
        <span>{subtitle}</span>
      </div>
      <div className="reconciliation-grid">
        {items.map((item) => (
          <article className={`reconciliation-card ${statusTone(item.status)}`} key={`${item.area}-${item.product}`}>
            <div>
              <span>{item.area}</span>
              <strong>{item.product}</strong>
            </div>
            <dl>
              <div><dt>Expected</dt><dd>{item.expected.toLocaleString()} L</dd></div>
              <div><dt>Actual</dt><dd>{item.actual.toLocaleString()} L</dd></div>
              <div><dt>Difference</dt><dd><VarianceValue item={item} /></dd></div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function VarianceValue({ item }: { item: ReconciliationItem }) {
  if (item.difference === 0) return <span className="variance-value good">Balanced</span>;
  const sign = item.difference > 0 ? "-" : "+";
  return <span className={`variance-value ${statusTone(item.status)}`}>{sign}{Math.abs(item.difference).toLocaleString()} L</span>;
}

function ReportMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <article className={`report-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function statusTone(status: ReconciliationItem["status"]) {
  if (status === "Balanced") return "good";
  if (status === "Small Variance") return "warn";
  return "bad";
}

function cardTone(baseTone: string, alertTone: "normal" | "warning" | "critical") {
  if (alertTone === "critical") return "orange";
  if (alertTone === "warning") return "yellow";
  return baseTone;
}

function storageLevelTone(percent: number, lowPercent: number, criticalPercent: number) {
  return cardTone("green", levelAlertTone(percent, lowPercent, criticalPercent));
}

function bulkTankTone(tank: LocalTank, alertSettings: SystemAlertSettings) {
  if (productIdForName(tank.name) === "waste-oil") {
    if (tank.percent >= alertSettings.bulkWasteOilCriticalPercent) return "orange";
    if (tank.percent >= alertSettings.bulkWasteOilWarningPercent) return "yellow";
    return "green";
  }
  return storageLevelTone(tank.percent, alertSettings.bulkLowLevelPercent, alertSettings.bulkCriticalLevelPercent);
}

function workshopTankTone(tank: WorkshopStockRecord, alertSettings: SystemAlertSettings) {
  const percent = Math.round((tank.current / tank.capacity) * 100);
  if (tank.productId === "waste-oil" || productIdForName(tank.name) === "waste-oil") {
    if (percent >= alertSettings.workshopWasteOilCriticalPercent) return "orange";
    if (percent >= alertSettings.workshopWasteOilWarningPercent) return "yellow";
    return "green";
  }
  return storageLevelTone(percent, alertSettings.workshopLowLevelPercent, alertSettings.workshopCriticalLevelPercent);
}

export function Branding() {
  const { branding, setBranding, resetBranding } = useBranding();
  const [draft, setDraft] = useState<BrandingSettings>(branding);
  const [message, setMessage] = useState("");

  async function handleImage(field: keyof BrandingSettings, file: File | undefined, allowedTypes: string[]) {
    if (!file) return;
    try {
      const image = await fileToDataUrl(file, allowedTypes);
      const next = { ...draft, [field]: image };
      setDraft(next);
      setBranding(next);
      setMessage("Preview updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    }
  }

  function save() {
    setBranding(draft);
    setMessage("Branding settings saved.");
  }

  function cancel() {
    setDraft(branding);
    setMessage("Unsaved preview changes cancelled.");
  }

  function reset() {
    setDraft(defaultBranding);
    resetBranding();
    setMessage("Branding reset to defaults.");
  }

  return (
    <section className="branding-centre">
      <ModuleTitle
        kicker="Settings"
        title="Branding"
        action={<button className="primary-button" type="button" onClick={save}><Save size={18} /> Save Branding</button>}
      />
      {message && <p className="success-banner">{message}</p>}
      <div className="branding-grid">
        <section className="branding-panel">
          <h3>Company Logo</h3>
          <p>PNG, JPG, SVG or WEBP. Maximum 5MB.</p>
          <BrandUpload label="Upload / Replace Logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(file) => handleImage("logo", file, ["image/png", "image/jpeg", "image/svg+xml", "image/webp"])} />
          <button className="secondary-button" type="button" onClick={() => { const next = { ...draft, logo: "" }; setDraft(next); setBranding(next); }}>Remove Logo</button>
          <div className="brand-preview logo-preview">{draft.logo ? <img src={draft.logo} alt="Logo preview" /> : <span>T</span>}</div>
        </section>

        <section className="branding-panel">
          <h3>Login Background</h3>
          <p>Used on Employee Login.</p>
          <BrandUpload label="Upload Login Background" accept="image/png,image/jpeg,image/webp" onChange={(file) => handleImage("loginBackground", file, ["image/png", "image/jpeg", "image/webp"])} />
          <div className="brand-preview login-preview" style={draft.loginBackground ? { backgroundImage: `url(${draft.loginBackground})` } : undefined}>
            <strong>{draft.companyName}</strong>
            <span>IN-FIELD SERVICING</span>
          </div>
        </section>

        <section className="branding-panel">
          <h3>Management Portal Background</h3>
          <p>Used on Management Portal welcome surfaces.</p>
          <BrandUpload label="Upload Portal Background" accept="image/png,image/jpeg,image/webp" onChange={(file) => handleImage("portalBackground", file, ["image/png", "image/jpeg", "image/webp"])} />
          <label>Opacity
            <select value={draft.portalBackgroundOpacity} onChange={(event) => { const next = { ...draft, portalBackgroundOpacity: Number(event.target.value) as BrandingSettings["portalBackgroundOpacity"] }; setDraft(next); setBranding(next); }}>
              <option value={0}>0%</option>
              <option value={25}>25%</option>
              <option value={50}>50%</option>
              <option value={75}>75%</option>
            </select>
          </label>
        </section>

        <section className="branding-panel">
          <h3>Sidebar Image</h3>
          <p>Used on the lower left sidebar hero.</p>
          <BrandUpload label="Upload Sidebar Image" accept="image/png,image/jpeg,image/webp" onChange={(file) => handleImage("sidebarImage", file, ["image/png", "image/jpeg", "image/webp"])} />
          <div className="brand-preview sidebar-preview" style={draft.sidebarImage ? { backgroundImage: `linear-gradient(180deg, rgba(8,13,19,.15), rgba(8,13,19,.86)), url(${draft.sidebarImage})` } : undefined}>
            <strong>IN-FIELD SERVICING</strong>
          </div>
        </section>

        <section className="branding-panel">
          <h3>Bulk Tank Image</h3>
          <p>Future ready. Uses default oil icon if none uploaded.</p>
          <BrandUpload label="Upload Bulk Tank Image" accept="image/png,image/jpeg,image/webp" onChange={(file) => handleImage("bulkTankImage", file, ["image/png", "image/jpeg", "image/webp"])} />
          <div className="brand-preview truck-preview">{draft.bulkTankImage ? <img src={draft.bulkTankImage} alt="Bulk tank preview" /> : <Droplets size={42} />}</div>
        </section>
      </div>

      <section className="branding-panel">
        <h3>Company Colours</h3>
        <div className="settings-grid">
          <label>Company Name<input value={draft.companyName} onChange={(event) => { const next = { ...draft, companyName: event.target.value }; setDraft(next); setBranding(next); }} /></label>
          <label>Primary Colour<input value={draft.primaryColour} onChange={(event) => { const next = { ...draft, primaryColour: event.target.value }; setDraft(next); setBranding(next); }} /></label>
          <label>Secondary Colour<input value={draft.secondaryColour} onChange={(event) => { const next = { ...draft, secondaryColour: event.target.value }; setDraft(next); setBranding(next); }} /></label>
        </div>
      </section>

      <div className="button-row detail-actions">
        <button className="primary-button" type="button" onClick={save}><Save size={18} /> Save Branding</button>
        <button className="secondary-button" type="button" onClick={reset}>Reset Defaults</button>
        <button className="secondary-button" type="button" onClick={cancel}>Cancel</button>
      </div>
    </section>
  );
}

function BrandUpload({ label, accept, onChange }: { label: string; accept: string; onChange: (file: File | undefined) => void }) {
  return (
    <label className="brand-upload">
      <Upload size={18} />
      {label}
      <input type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0])} />
    </label>
  );
}

function ServiceTruckImage({ image }: { image: string }) {
  if (image) {
    return <div className="truck-photo service-photo branded-truck-photo" style={{ backgroundImage: `url(${image})` }} aria-label="Service truck image" />;
  }
  return (
    <div className="truck-photo service-photo" aria-label="Service truck image">
      <div className="truck-cab" />
      <div className="truck-tank" />
      <div className="truck-wheel left" />
      <div className="truck-wheel right" />
    </div>
  );
}

function TruckListThumb({ image }: { image: string }) {
  return (
    <span className="mini-truck-image real-truck-thumb">
      {image ? <img src={image} alt="" /> : null}
    </span>
  );
}

export function SystemSettings() {
  const [settings, setSettings] = useState<SystemAlertSettings>(loadSystemAlertSettings);
  const [message, setMessage] = useState("");

  function updateSetting<K extends keyof SystemAlertSettings>(key: K, value: SystemAlertSettings[K]) {
    setSettings({ ...settings, [key]: value });
  }

  function saveSettings() {
    saveSystemAlertSettings(settings);
    setMessage("System alert settings saved.");
  }

  function resetSettings() {
    resetSystemAlertSettings();
    setSettings(defaultSystemAlertSettings);
    setMessage("System alert settings reset to defaults.");
  }

  return (
    <section className="module-page">
      <ModuleTitle
        kicker="Settings"
        title="System Settings"
        action={(
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={resetSettings}>Reset Defaults</button>
            <button className="primary-button" type="button" onClick={saveSettings}><Save size={18} /> Save Settings</button>
          </div>
        )}
      />
      {message && <p className="success-banner">{message}</p>}
      <LocalBackupButton />
      <section className="original-panel">
        <div className="section-heading">
          <h3>Oil Variance / Difference Tolerance</h3>
          <span>Controls when unaccounted oil becomes an alert</span>
        </div>
        <div className="settings-grid alert-settings-grid">
          <ToleranceField
            label="Bulk Storage Variance Tolerance"
            value={settings.bulkVarianceTolerance}
            mode={settings.bulkVarianceMode}
            onValue={(value) => updateSetting("bulkVarianceTolerance", value)}
            onMode={(mode) => updateSetting("bulkVarianceMode", mode)}
          />
          <ToleranceField
            label="Workshop Storage Variance Tolerance"
            value={settings.workshopVarianceTolerance}
            mode={settings.workshopVarianceMode}
            onValue={(value) => updateSetting("workshopVarianceTolerance", value)}
            onMode={(mode) => updateSetting("workshopVarianceMode", mode)}
          />
          <ToleranceField
            label="Service Truck Variance Tolerance"
            value={settings.serviceTruckVarianceTolerance}
            mode={settings.serviceTruckVarianceMode}
            onValue={(value) => updateSetting("serviceTruckVarianceTolerance", value)}
            onMode={(mode) => updateSetting("serviceTruckVarianceMode", mode)}
          />
        </div>
      </section>
      <section className="original-panel">
        <div className="section-heading">
          <h3>Stock Level Alerts</h3>
          <span>Default low and critical percentage thresholds</span>
        </div>
        <div className="settings-grid alert-settings-grid">
          <LevelAlertField
            title="Bulk Storage Level Alerts"
            low={settings.bulkLowLevelPercent}
            critical={settings.bulkCriticalLevelPercent}
            onLow={(value) => updateSetting("bulkLowLevelPercent", value)}
            onCritical={(value) => updateSetting("bulkCriticalLevelPercent", value)}
          />
          <WasteOilAlertField
            title="Bulk Waste Oil Storage Alerts"
            warning={settings.bulkWasteOilWarningPercent}
            critical={settings.bulkWasteOilCriticalPercent}
            onWarning={(value) => updateSetting("bulkWasteOilWarningPercent", value)}
            onCritical={(value) => updateSetting("bulkWasteOilCriticalPercent", value)}
          />
          <LevelAlertField
            title="Workshop Storage Level Alerts"
            low={settings.workshopLowLevelPercent}
            critical={settings.workshopCriticalLevelPercent}
            onLow={(value) => updateSetting("workshopLowLevelPercent", value)}
            onCritical={(value) => updateSetting("workshopCriticalLevelPercent", value)}
          />
          <WasteOilAlertField
            title="Workshop Waste Oil Storage Alerts"
            warning={settings.workshopWasteOilWarningPercent}
            critical={settings.workshopWasteOilCriticalPercent}
            onWarning={(value) => updateSetting("workshopWasteOilWarningPercent", value)}
            onCritical={(value) => updateSetting("workshopWasteOilCriticalPercent", value)}
          />
          <LevelAlertField
            title="Service Truck Stock Alerts"
            low={settings.serviceTruckLowLevelPercent}
            critical={settings.serviceTruckCriticalLevelPercent}
            onLow={(value) => updateSetting("serviceTruckLowLevelPercent", value)}
            onCritical={(value) => updateSetting("serviceTruckCriticalLevelPercent", value)}
          />
        </div>
      </section>
      <section className="original-panel">
        <div className="section-heading">
          <h3>Fuel Farm Display Settings</h3>
          <span>Controls the automatic shift shown on the read-only live display</span>
        </div>
        <div className="settings-grid alert-settings-grid">
          <article className="alert-setting-card">
            <h3>Display Shift Changeover</h3>
            <label>Day Shift Starts
              <input type="time" value={settings.fuelDisplayDayShiftStart} onChange={(event) => updateSetting("fuelDisplayDayShiftStart", event.target.value)} />
            </label>
            <label>Night Shift Starts
              <input type="time" value={settings.fuelDisplayNightShiftStart} onChange={(event) => updateSetting("fuelDisplayNightShiftStart", event.target.value)} />
            </label>
          </article>
        </div>
      </section>
    </section>
  );
}

function ToleranceField({ label, value, mode, onValue, onMode }: { label: string; value: number; mode: SystemAlertSettings["bulkVarianceMode"]; onValue: (value: number) => void; onMode: (mode: SystemAlertSettings["bulkVarianceMode"]) => void }) {
  return (
    <article className="alert-setting-card">
      <h3>{label}</h3>
      <label>Tolerance<input type="number" value={value} onChange={(event) => onValue(Number(event.target.value))} /></label>
      <label>Measured by<select value={mode} onChange={(event) => onMode(event.target.value as SystemAlertSettings["bulkVarianceMode"])}><option value="litres">Litres</option><option value="percentage">Percentage</option></select></label>
    </article>
  );
}

function LevelAlertField({ title, low, critical, onLow, onCritical }: { title: string; low: number; critical: number; onLow: (value: number) => void; onCritical: (value: number) => void }) {
  return (
    <article className="alert-setting-card">
      <h3>{title}</h3>
      <label>Low Level Alert %<input type="number" value={low} onChange={(event) => onLow(Number(event.target.value))} /></label>
      <label>Critical Level Alert %<input type="number" value={critical} onChange={(event) => onCritical(Number(event.target.value))} /></label>
    </article>
  );
}

function WasteOilAlertField({ title, warning, critical, onWarning, onCritical }: { title: string; warning: number; critical: number; onWarning: (value: number) => void; onCritical: (value: number) => void }) {
  return (
    <article className="alert-setting-card">
      <h3>{title}</h3>
      <p>Waste oil alerts increase as the storage fills.</p>
      <label>Warning Fill Alert %<input type="number" value={warning} onChange={(event) => onWarning(Number(event.target.value))} /></label>
      <label>Critical Fill Alert %<input type="number" value={critical} onChange={(event) => onCritical(Number(event.target.value))} /></label>
    </article>
  );
}

function MovementTable({ title }: { title: string }) {
  return (
    <div className="panel table-panel">
      <div className="panel-title"><FileText size={20} /><h2>{title}</h2></div>
      <DataTable
        headers={["Date", "Product", "Source", "Target", "Litres", "Employee"]}
        rows={[]}
        emptyMessage="No live stock movements recorded yet."
      />
    </div>
  );
}

function DataTable({ headers, rows, emptyMessage = "No live records found." }: { headers: string[]; rows: Array<Array<ReactNode>>; emptyMessage?: string }) {
  return (
    <div className="panel table-panel">
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : (
              <tr><td className="empty-table-cell" colSpan={headers.length}>{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
