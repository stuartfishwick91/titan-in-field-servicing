import { useState, type FormEvent } from "react";
import { Fuel, QrCode } from "lucide-react";
import { AssetQrScanner } from "./AssetQrScanner";
import { resolveAssetQr } from "../data/assetQr";
import { loadAssets } from "../data/assetStore";
import { loadBulkTanks, saveBulkTanks } from "../data/bulkTankStore";
import { loadFuelSubmissions, saveFuelSubmissions } from "../data/fuelSubmissionStore";
import { loadFuelSchedule, saveFuelSchedule, type FuelShift } from "../data/fuelScheduleStore";
import { prepareFuelFarmEntry } from "../data/fuelFarmEntry";

export function FuelFarmEntryTab({ employee }: { employee: string }) {
  const [assetNumber, setAssetNumber] = useState("");
  const [scanning, setScanning] = useState(false);
  const [litres, setLitres] = useState("");
  const [smu, setSmu] = useState("");
  const [shift, setShift] = useState<FuelShift>(() => new Date().getHours() >= 6 && new Date().getHours() < 18 ? "Day Shift" : "Night Shift");
  const [error, setError] = useState("");
  const [recorded, setRecorded] = useState(false);
  const assets = loadAssets();
  const tanks = loadBulkTanks().filter(t => t.productId === "diesel");

  function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setRecorded(false);
    try {
      if (!smu.trim() || !litres.trim()) throw new Error("Enter the SMU and litres dispensed.");
      const dieselTanks = loadBulkTanks().filter(t => t.productId === "diesel");
      const tank = dieselTanks.find(t => t.id === "bulk-diesel") ?? (dieselTanks.length === 1 ? dieselTanks[0] : undefined);
      if (!tank) throw new Error("Ask management to configure one default diesel tank in Bulk Storage before recording fuel.");
      const tankId = tank.id;
      const next = prepareFuelFarmEntry({ assetNumber, tankId, employee, shift,
        litres: Number(litres), smu: Number(smu), id: crypto.randomUUID(), now: new Date(),
      }, loadAssets(), loadBulkTanks(), loadFuelSubmissions(), loadFuelSchedule());
      // These synchronous writes are grouped into one shared cloud commit.
      saveFuelSubmissions(next.fuel);
      saveFuelSchedule(next.schedule);
      saveBulkTanks(next.tanks);
      setLitres(""); setSmu(""); setRecorded(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record this fuel-up."); }
  }

  return <form className="employee-form" onSubmit={submit}>
    <h2>Fuel Farm Entry</h2>
    <p>Record diesel dispensed into an asset. This updates Live Fuel Status, the Daily Sheet and fuel farm stock.</p>
    {recorded && <p className="success-banner">Fuel farm entry recorded.</p>}
    {error && <p role="alert" className="form-warning">{error}</p>}
    <button className="primary-button wide-button" type="button" onClick={() => setScanning(true)}><QrCode size={18} />Scan Asset QR Code</button>
    {scanning && <AssetQrScanner onClose={() => setScanning(false)} onScan={payload => {
      const asset = resolveAssetQr(payload, loadAssets());
      setAssetNumber(asset.assetNumber); setError(""); setRecorded(false); setScanning(false);
      window.dispatchEvent(new Event("titan-cloud-form-edited"));
    }} />}
    <label>Asset<select value={assetNumber} required onChange={e => setAssetNumber(e.target.value)}>
      <option value="">Select asset</option>
      {assets.map(asset => <option key={asset.assetNumber} value={asset.assetNumber} disabled={asset.status === "Maintenance" || asset.status === "In Service"}>{asset.assetNumber} — {asset.make} {asset.model}</option>)}
    </select></label>
    {!assets.length && <p>Add an asset in management before recording a fuel-up.</p>}
    <label>Shift<select value={shift} onChange={e => setShift(e.target.value as FuelShift)}><option>Day Shift</option><option>Night Shift</option></select></label>
    <label>Current SMU<input type="number" inputMode="decimal" min="0" step="any" required value={smu} onChange={e => setSmu(e.target.value)} /></label>
    <label>Litres dispensed<input type="number" inputMode="decimal" min="0.01" step="0.01" required value={litres} onChange={e => setLitres(e.target.value)} /></label>
    <button type="submit" className="primary-button wide-button" disabled={!assets.length || !tanks.length}><Fuel size={18} />Save Fuel Farm Entry</button>
  </form>;
}
