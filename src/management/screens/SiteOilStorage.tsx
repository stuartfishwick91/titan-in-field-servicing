import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { applyStockOperation, departments, summarizeSiteStock, movementKind, type Department, type StockOperation } from "../../data/siteInventoryModel";
import { loadFacilities, loadSiteStock, loadStockAudit, saveFacilities, saveSiteStock } from "../../data/siteInventory";

const litresText = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
const productName = (value: string) => ({ "engine-15w40": "Engine Oil 15W-40", "hydraulic-46": "Hydraulic Oil 46", "hydraulic-32": "Hydraulic Oil 32", transmission: "Transmission Oil", diesel: "Diesel", coolant: "Coolant", "waste-oil": "Waste Oil" }[value] ?? value);

function StorageCard({ name, location, current, capacity, expected, shortage, surplus }: { name: string; location: string; current: number; capacity: number; expected: number; shortage: number; surplus: number }) {
  const percent = capacity > 0 ? current / capacity * 100 : null;
  return <article className="bulk-level-card site-storage-card">
    <span className="site-storage-location">{location}</span><h3>{name}</h3>
    <div className="large-ring green" role="img" aria-label={`${name}: ${percent === null ? "capacity not set" : `${percent.toFixed(1)} percent full`}`} style={{ "--level": `${Math.min(100, Math.max(0, percent ?? 0))}%` } as CSSProperties}>
      <div><strong>{percent === null ? "—" : `${Math.round(percent)}%`}</strong><span>Full</span></div>
    </div>
    <b>{litresText(current)} / {litresText(capacity)}</b>
    <span className="site-storage-location">Recorded stock / capacity</span>
    <dl className="site-storage-balances">
      <div><dt>Expected</dt><dd>{litresText(expected)}</dd></div>
      <div className={shortage > 0 ? "site-storage-shortage" : ""}><dt>Shortage</dt><dd>{litresText(shortage)}</dd></div>
      <div><dt>Surplus</dt><dd>{litresText(surplus)}</dd></div>
    </dl>
  </article>;
}

export function SiteOilStorage() {
  const [department, setDepartment] = useState<Department | "Site total">("Site total");
  const [rows, setRows] = useState(loadSiteStock);
  const [history, setHistory] = useState(loadStockAudit);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [kind, setKind] = useState<StockOperation["kind"]>("transfer");
  const [litres, setLitres] = useState("");
  const [name, setName] = useState("");
  const [product, setProduct] = useState("engine-15w40");
  const [capacity, setCapacity] = useState("1000");
  const [opening, setOpening] = useState("0");
  const [category, setCategory] = useState("Oils");
  useEffect(() => {
    const refresh = () => { setRows(loadSiteStock()); setHistory(loadStockAudit()); };
    const events = ["storage", "titan-bulk-tanks-updated", "titan-workshop-stock-updated", "titan-service-trucks-updated", "titan-site-stock-updated"];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => events.forEach(event => window.removeEventListener(event, refresh));
  }, []);
  const categoryMatches = (id: string) => category === "All products" || (category === "Oils" ? !["diesel", "coolant", "waste-oil"].includes(id) : category === "Fuel" ? id === "diesel" : category === "Coolant" ? id === "coolant" : id === "waste-oil");
  const visible = rows.filter(row => (department === "Site total" || row.department === department) && categoryMatches(row.productId));
  const selected = rows.find(row => row.key === source);
  const totals = summarizeSiteStock(visible);
  const productIds = [...new Set(rows.map(row => row.productId))];

  function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (!litres.trim()) throw new Error("Enter litres.");
      saveSiteStock(applyStockOperation(loadSiteStock(), { kind, source, destination, litres: Number(litres) }));
      setLitres(""); setMessage("Stock movement recorded. The shared save includes both locations and the movement history.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save stock movement."); }
  }
  function addFacility(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      if (department !== "Field" && department !== "Light Vehicles") return;
      const cap = Number(capacity); const current = Number(opening);
      if (!name.trim() || !capacity.trim() || !opening.trim() || !Number.isFinite(cap) || cap <= 0 || !Number.isFinite(current) || current < 0 || current > cap) throw new Error("Enter a name, positive capacity and opening stock between zero and capacity.");
      saveFacilities([...loadFacilities(), { id: crypto.randomUUID(), department, name: name.trim(), productId: product, capacity: cap, current, expected: current }]);
      setName(""); setOpening("0"); setMessage("Compartment added with an opening stock balance.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add compartment."); }
  }

  return <section className="site-oil-page">
    <h1>Site Oil Storage</h1>
    <p>Linked stock across departments. Internal transfers preserve the site total; equipment usage reduces it. A dip changes recorded stock while expected stock remains available for comparison.</p>
    <div className="site-stock-tabs" role="tablist" aria-label="Storage departments">
      {(["Site total", ...departments] as const).map(item => <button key={item} type="button" role="tab" aria-selected={department === item} onClick={() => setDepartment(item)}>{item}</button>)}
    </div>
    <label>Products<select value={category} onChange={e => setCategory(e.target.value)}>{["Oils", "Fuel", "Coolant", "Waste Oil", "All products"].map(item => <option key={item}>{item}</option>)}</select></label>
    {error && <p role="alert" className="form-warning">{error}</p>}
    {message && <p className="success-banner">{message}</p>}
    <h2>{department} — product totals</h2>
    <p>Shortages and surpluses are shown separately; they are not cancelled against another location. Stock figures include recorded movements since the last physical count, not live tank sensor readings.</p>
    <div className="site-storage-grid">
      {totals.map(row => <StorageCard key={row.productId} name={productName(row.productId)} location={`${department} · combined storage`} {...row} capacity={visible.filter(item => item.productId === row.productId).reduce((sum, item) => sum + item.capacity, 0)} />)}
    </div>
    {!totals.length && <p>No compartments configured for this view. Add a compartment below to see its storage level.</p>}
    <details className="site-storage-details"><summary>View product totals as a table</summary>
    <div className="site-stock-table"><table><thead><tr><th>Product</th><th>Recorded stock</th><th>Expected stock</th><th>Shortage</th><th>Surplus</th></tr></thead><tbody>
      {totals.map(row => <tr key={row.productId}><td>{productName(row.productId)}</td><td>{litresText(row.current)}</td><td>{litresText(row.expected)}</td><td>{litresText(row.shortage)}</td><td>{litresText(row.surplus)}</td></tr>)}
      {!totals.length && <tr><td colSpan={5}>No compartments configured for this view.</td></tr>}
    </tbody></table></div>
    </details>
    <h2>Department compartments</h2>
    <div className="site-storage-grid">
      {visible.map(row => <StorageCard key={row.key} name={row.name} location={`${row.department} · ${productName(row.productId)}`} current={row.current} capacity={row.capacity} expected={row.expected} shortage={Math.max(0, row.expected - row.current)} surplus={Math.max(0, row.current - row.expected)} />)}
    </div>
    <details className="site-storage-details"><summary>View compartment details as a table</summary>
    <div className="site-stock-table"><table><thead><tr><th>Department / location</th><th>Product</th><th>Stock</th><th>Expected</th><th>Difference (stock − expected)</th></tr></thead><tbody>
      {visible.map(row => <tr key={row.key}><td>{row.department} / {row.name}</td><td>{productName(row.productId)}</td><td>{litresText(row.current)}</td><td>{litresText(row.expected)}</td><td>{litresText(row.current - row.expected)}</td></tr>)}
    </tbody></table></div>
    </details>
    <p><Link to="/management/bulk-tanks">Manage bulk compartments</Link> · <Link to="/management/workshop-storage">Manage workshop compartments</Link> · <Link to="/management/service-trucks">Manage service trucks</Link></p>
    <section className="original-panel"><h2>Record stock movement</h2>
      <form onSubmit={submit} className="settings-grid">
        <label>Action<select value={kind} onChange={e => setKind(e.target.value as StockOperation["kind"])}><option value="transfer">Internal transfer</option><option value="delivery">External delivery</option><option value="usage">Equipment usage / stock issued</option><option value="dip">Measured stock / tank dip</option></select></label>
        <label>{kind === "delivery" ? "Receiving location" : "Stock location / source"}<select required value={source} onChange={e => { setSource(e.target.value); setDestination(""); }}><option value="">Select location</option>{rows.map(row => <option key={row.key} value={row.key}>{row.department} / {row.name} — {productName(row.productId)}</option>)}</select></label>
        {kind === "transfer" && <label>Destination<select required value={destination} onChange={e => setDestination(e.target.value)}><option value="">Select matching product location</option>{rows.filter(row => row.key !== source && row.productId === selected?.productId).map(row => <option key={row.key} value={row.key}>{row.department} / {row.name}</option>)}</select></label>}
        <label>{kind === "dip" ? "Measured total litres" : "Litres moved / used"}<input required type="number" min={kind === "dip" ? 0 : 0.01} step="0.01" value={litres} onChange={e => setLitres(e.target.value)} /></label>
        <button className="primary-button" type="submit">Record stock movement</button>
      </form>
    </section>
    {(department === "Field" || department === "Light Vehicles") && <section className="original-panel"><h2>Add {department} compartment</h2><form className="settings-grid" onSubmit={addFacility}>
      <label>Compartment / location name<input required value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Product<select value={product} onChange={e => setProduct(e.target.value)}>{productIds.map(id => <option key={id} value={id}>{productName(id)}</option>)}</select></label>
      <label>Capacity (L)<input required type="number" min="0.01" step="0.01" value={capacity} onChange={e => setCapacity(e.target.value)} /></label>
      <label>Opening stock (L)<input required type="number" min="0" step="0.01" value={opening} onChange={e => setOpening(e.target.value)} /></label>
      <button type="submit" className="primary-button">Add compartment</button>
    </form></section>}
    <h2>Recorded movement and discrepancy history</h2>
    <p>History starts with this update. Negative stock differences indicate unexplained shortages, which need investigation; they do not by themselves prove a loss.</p>
    <div className="site-stock-table"><table><thead><tr><th>When / recorded by</th><th>Movement</th><th>Department / product</th><th>Stock before → after</th><th>Expected before → after</th></tr></thead><tbody>
      {history.flatMap(event => [...new Set(event.changes.map(change => change.productId))].flatMap(id => {
        const changes = event.changes.filter(change => change.productId === id);
        return changes.filter(change => (department === "Site total" || change.department === department) && categoryMatches(id)).map(change => <tr key={`${event.id}:${change.key}:${id}`}><td>{new Date(event.at).toLocaleString()}<br />{event.user}</td><td>{movementKind(changes)}</td><td>{change.department} / {change.name}<br />{productName(id)}</td><td>{litresText(change.before)} → {litresText(change.after)}</td><td>{litresText(change.expectedBefore)} → {litresText(change.expectedAfter)}</td></tr>);
      }))}
      {!history.length && <tr><td colSpan={5}>No stock movements recorded since this update.</td></tr>}
    </tbody></table></div>
  </section>;
}
