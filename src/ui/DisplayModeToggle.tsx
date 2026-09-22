import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function DisplayModeToggle() {
  const [light, setLight] = useState(() => localStorage.getItem("titan-display-mode") === "light");
  useEffect(() => { document.documentElement.dataset.displayMode = light ? "light" : "dark"; }, [light]);
  return <button className="display-mode-toggle" type="button" aria-pressed={light} onClick={() => {
    const next = !light; localStorage.setItem("titan-display-mode", next ? "light" : "dark"); setLight(next);
  }}>{light ? <Moon size={17} /> : <Sun size={17} />}<span>{light ? "Dark mode" : "Daylight mode"}</span></button>;
}
