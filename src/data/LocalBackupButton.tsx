import { useState } from "react";
import { Download } from "lucide-react";
import { downloadLocalBackup } from "./localBackup";

export function LocalBackupButton() {
  const [message, setMessage] = useState("");
  return <div className="local-backup-control">
    <button className="secondary-button" type="button" onClick={() => {
      try { downloadLocalBackup(); setMessage("Backup download started. Keep a copy from each device before moving to shared data."); }
      catch { setMessage("Could not download the backup. Your existing records have not been changed."); }
    }}><Download size={18} />Back up this device</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
