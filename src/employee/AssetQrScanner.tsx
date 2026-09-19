import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

export function AssetQrScanner({ onScan, onClose }: { onScan: (payload: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const scan = useRef(onScan);
  scan.current = onScan;
  const scanner = useRef<QrScanner | null>(null);
  const active = useRef(true);
  const [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    const reader = new QrScanner(video.current!, result => {
      try { scan.current(result.data); } catch (e) { setError(e instanceof Error ? e.message : "Unrecognised QR code."); }
    }, { preferredCamera: "environment", maxScansPerSecond: 5, returnDetailedScanResult: true });
    scanner.current = reader;
    void reader.start().catch(() => {
      if (active.current) setError("Camera unavailable. Allow camera access in your browser, choose a QR photo below, or close this window and select the asset manually.");
    });
    return () => { active.current = false; reader.destroy(); scanner.current = null; };
  }, []);

  return <div className="cloud-overlay"><section role="dialog" aria-modal="true" aria-label="Scan asset QR code">
    <h2>Scan Asset QR Code</h2>
    <p>Point the camera at the asset’s QR label.</p>
    <video ref={video} muted playsInline style={{ width: "100%", maxHeight: "45dvh", objectFit: "contain" }} />
    {error && <p role="alert">{error}</p>}
    <label>Choose a QR photo<input type="file" accept="image/*" onChange={async event => {
      const file = event.target.files?.[0]; if (!file) return;
      scanner.current?.stop(); setError("");
      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        if (active.current) scan.current(result.data);
      } catch (e) {
        if (active.current) setError(e instanceof Error ? e.message : "No readable QR code found. Choose another photo or select the asset manually.");
      }
    }} /></label>
    <button type="button" onClick={onClose}>Close scanner</button>
  </section></div>;
}
