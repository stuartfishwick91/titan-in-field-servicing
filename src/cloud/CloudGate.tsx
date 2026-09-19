import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { LoginScreen } from "../branding/LoginScreen";
import { LocalBackupButton } from "../data/LocalBackupButton";
import { defaultUsers } from "../data/userAccessStore";
import { supabase } from "./client";
import { setCloudIdentity } from "./identity";
import { cloudIdentity } from "./identity";
import { withStockAudit } from "../data/siteInventory";
import { closeSharedDocuments, copySharedDocuments, readDeviceDocuments, useSharedDocuments } from "./sharedStorage";
import { SyncEngine, type Documents, type Pending, type Snapshot, type Transport } from "./syncEngine";

function errorText(error: unknown) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
}
function downloadDraft(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "titan-unsaved-trial-action.json";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CloudGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [initialise, setInitialise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState("Connecting…");
  const [epoch, setEpoch] = useState(0);
  const [remoteWaiting, setRemoteWaiting] = useState(false);
  const engine = useRef<SyncEngine | null>(null);
  const dirty = useRef(false);
  const scheduled = useRef(false);
  const alive = useRef(0);
  const busyRef = useRef(false);
  const pendingKey = session ? `titan-pending-cloud-${session.user.id}` : "";

  useEffect(() => {
    let active = true;
    const markEdited = () => { dirty.current = true; };
    window.addEventListener("titan-cloud-form-edited", markEdited);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setAuthLoaded(true); }
    });
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) setError(authError.message);
      setSession(data.session); setAuthLoaded(true);
    });
    const logout = () => {
      setCloudIdentity(null); closeSharedDocuments(); setReady(false);
      void supabase.auth.signOut({ scope: "local" }).then(({ error: logoutError }) => {
        if (logoutError) setError(logoutError.message);
        setSession(null);
      });
    };
    window.addEventListener("titan-cloud-signout", logout);
    return () => { active = false; subscription.unsubscribe(); window.removeEventListener("titan-cloud-signout", logout); window.removeEventListener("titan-cloud-form-edited", markEdited); };
  }, []);

  const transport: Transport = {
    read: async () => {
      const { data, error: readError } = await supabase.from("trial_workspaces")
        .select("revision,documents").eq("owner_id", session!.user.id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
      if (readError) throw readError;
      return data as Snapshot | null;
    },
    commit: async (pending) => {
      const { data, error: writeError } = await supabase.rpc("commit_trial_workspace", {
        expected_revision: pending.expectedRevision, next_documents: pending.documents, operation_id: pending.operationId,
      }).abortSignal(AbortSignal.timeout(15000)).single();
      if (writeError) throw writeError;
      return data as Snapshot;
    },
  };

  function install(snapshot: Snapshot, remount = false) {
    useSharedDocuments(snapshot.documents, queueSave);
    window.dispatchEvent(new Event("storage"));
    if (remount) setEpoch(value => value + 1);
  }

  function queueSave() {
    if (scheduled.current) return;
    scheduled.current = true;
    busyRef.current = true;
    setBusy(true); setStatus("Saving to shared trial…");
    queueMicrotask(() => {
      scheduled.current = false;
      try {
        if (!engine.current) throw new Error("The shared trial is not ready.");
        const operationId = crypto.randomUUID();
        const candidate = withStockAudit(engine.current.snapshot.documents, copySharedDocuments(), cloudIdentity()?.fullName ?? "Administrator", operationId);
        engine.current.stage(candidate, operationId);
        void save();
      } catch (e) {
        setSaveError(errorText(e)); setBusy(false); busyRef.current = false;
        setStatus("Not saved — action needed");
      }
    });
  }

  async function save() {
    const current = engine.current;
    if (!current) return;
    setBusy(true); busyRef.current = true; setSaveError("");
    const generation = alive.current;
    try {
      const result = await current.save();
      if (generation !== alive.current) return;
      dirty.current = false; setRemoteWaiting(false);
      install(result); setStatus("Saved to shared trial");
    } catch (e) {
      if (generation !== alive.current) return;
      setSaveError(errorText(e)); setStatus("Not saved — action needed");
    } finally {
      if (generation === alive.current) { setBusy(false); busyRef.current = false; }
    }
  }

  async function load() {
    const generation = ++alive.current;
    setReady(false); setInitialise(false); setError(""); setSaveError("");
    setCloudIdentity(null); closeSharedDocuments(); engine.current = null;
    if (!session) return;
    try {
      const { data: member, error: memberError } = await supabase.from("trial_members")
        .select("user_id,full_name,role").eq("user_id", session.user.id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
      if (memberError) throw memberError;
      if (!member) throw new Error("Your login is valid but trial access has not been enabled yet. Contact the project owner.");
      const snapshot = await transport.read();
      if (generation !== alive.current) return;
      setCloudIdentity({ ...defaultUsers[2], id: member.user_id, fullName: member.full_name,
        email: session.user.email ?? "", role: "Administrator", pin: "", lastLogin: "",
        employeeRole: "Serviceperson", mustResetPin: false });
      if (!snapshot) { setInitialise(true); return; }
      const raw = localStorage.getItem(pendingKey);
      const pending = raw ? JSON.parse(raw) as Pending : null;
      engine.current = new SyncEngine(snapshot, pending, transport, (next) => {
        if (next) localStorage.setItem(pendingKey, JSON.stringify(next));
        else localStorage.removeItem(pendingKey);
      });
      dirty.current = false; setRemoteWaiting(false);
      install(snapshot); setReady(true); setStatus("Connected to shared trial");
      if (pending) setSaveError("This device has an unfinished save. Retry it or download it before reloading shared records.");
    } catch (e) { if (generation === alive.current) setError(errorText(e)); }
  }

  useEffect(() => {
    void load();
    return () => { alive.current++; engine.current = null; setCloudIdentity(null); closeSharedDocuments(); };
  }, [session?.user.id]);

  useEffect(() => {
    if (!ready) return;
    let reading = false;
    let active = true;
    const poll = async () => {
      const current = engine.current;
      if (!active || reading || busyRef.current || current?.pending || !current || document.hidden) return;
      reading = true;
      try {
        const { data, error: pollError } = await supabase.from("trial_workspaces").select("revision")
          .eq("owner_id", session!.user.id).abortSignal(AbortSignal.timeout(10000)).single();
        if (pollError) throw pollError;
        if (!active || busyRef.current || current.pending) return;
        if (data.revision !== current.snapshot.revision) {
          if (dirty.current) { setRemoteWaiting(true); setStatus("Another device has updated records"); return; }
          const snapshot = await transport.read();
          if (!active || busyRef.current || dirty.current || current.pending) return;
          if (!snapshot) throw new Error("Workspace not available");
          current.snapshot = snapshot;
          install(snapshot, true);
        }
        setStatus("Connected to shared trial");
      } catch { if (active) setStatus("Connection interrupted — saves require a connection"); }
      finally { reading = false; }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    const focus = () => void poll();
    window.addEventListener("focus", focus);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (engine.current?.pending || dirty.current || busyRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", focus); window.removeEventListener("beforeunload", beforeUnload); };
  }, [ready, session?.user.id]);

  async function initialiseWorkspace(fromDevice: boolean) {
    setBusy(true); setError("");
    try {
      const { error: insertError } = await supabase.from("trial_workspaces").insert({
        owner_id: session!.user.id, documents: fromDevice ? readDeviceDocuments() : {},
      });
      if (insertError && insertError.code !== "23505") throw insertError;
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function reloadShared() {
    setBusy(true); busyRef.current = true;
    try {
      const result = await engine.current!.discard();
      dirty.current = false; setSaveError(""); setRemoteWaiting(false); install(result, true);
      setStatus("Shared records reloaded");
    } catch (e) { setSaveError(errorText(e)); }
    finally { setBusy(false); busyRef.current = false; }
  }

  if (!authLoaded) return <main className="cloud-setup"><p>Checking sign-in…</p></main>;
  if (!session) return <LoginScreen cloud busy={busy} error={error} onLogin={async (email, password) => {
    setBusy(true); setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) setError(loginError.message);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }} />;
  if (!ready) return <main className="cloud-setup">
    <h1>{initialise ? "Start your shared trial" : "Connect to your shared trial"}</h1>
    {initialise ? <>
      <p>Choose the starting records once, on your desktop. Both devices will then use those shared records.</p>
      <p>Your old device records stay on this device. Back them up before continuing.</p>
      <LocalBackupButton />
      <button disabled={busy} onClick={() => void initialiseWorkspace(true)}>Use this device’s records</button>
      <button disabled={busy} onClick={() => void initialiseWorkspace(false)}>Start with sample stock and empty records</button>
    </> : <p>{error || "Loading your account and records…"}</p>}
    {initialise && error && <p role="alert">{error}</p>}
    {error && <button disabled={busy} onClick={() => void load()}>Retry connection</button>}
    <button disabled={busy} onClick={() => window.dispatchEvent(new Event("titan-cloud-signout"))}>Sign out</button>
  </main>;

  return <>
    <div className="cloud-status" role="status">
      <span>{status}</span><Link to="/employee">Employee</Link><Link to="/management/dashboard">Management</Link>
      {remoteWaiting && <button onClick={() => { setSaveError("Another device changed the shared records. Reloading will discard this form’s unsaved edits."); }}>Review update</button>}
    </div>
    <div key={epoch} className={busy || saveError ? "cloud-blocked" : ""} onChangeCapture={() => { dirty.current = true; }} aria-busy={busy}>
      {children}
    </div>
    {(busy || saveError) && <div className="cloud-overlay"><section role="dialog" aria-modal="true" aria-label="Shared trial save">
      <h2>{busy ? "Saving to the shared trial…" : "Action needed"}</h2>
      <p>{busy ? "Please keep this page open until the save finishes." : saveError}</p>
      {!busy && <>
        <p>Your last action is not confirmed as saved. Download it before discarding if you need to keep a copy.</p>
        {engine.current?.pending && !saveError.includes("Another device") && <button onClick={() => void save()}>Retry save</button>}
        <button onClick={() => downloadDraft(engine.current?.pending ?? { documents: copySharedDocuments() })}>Download unsaved action</button>
        <button onClick={() => void reloadShared()}>Discard unsaved edits and reload shared records</button>
      </>}
    </section></div>}
  </>;
}
