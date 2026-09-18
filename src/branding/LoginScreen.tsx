import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useBranding } from "./BrandingContext";

const rememberedNameKey = "titan-remembered-login-name";

function rememberedName() {
  try { return localStorage.getItem(rememberedNameKey) ?? ""; }
  catch { return ""; }
}

type LoginScreenProps = {
  onLogin: (name: string, pin: string) => void;
  error: string;
  management?: boolean;
};

export function LoginScreen({ onLogin, error, management = false }: LoginScreenProps) {
  const { branding } = useBranding();
  const [name, setName] = useState(rememberedName);
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(() => Boolean(rememberedName()));
  const [showPin, setShowPin] = useState(false);
  const [help, setHelp] = useState("");
  const assets = `${import.meta.env.BASE_URL}branding/`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (remember) localStorage.setItem(rememberedNameKey, name.trim());
      else localStorage.removeItem(rememberedNameKey);
    } catch { /* Sign-in remains available when browser storage is restricted. */ }
    setHelp("");
    onLogin(name, pin);
  }

  return (
    <main className="titan-login" style={{ backgroundImage: `url("${branding.loginBackground || `${assets}login-background.png`}")` }}>
      <section className="titan-login-panel" aria-label={management ? "Management sign in" : "Sign in"}>
        <div className="titan-login-brand">
          <img src={branding.logo || `${assets}titan-wordmark.png`} alt={`${branding.companyName} — In Field Servicing`} />
        </div>
        <div className="titan-login-intro">
          <h1>WELCOME <span>BACK</span></h1>
          <p>Sign in to access Titan In Field Servicing.</p>
        </div>
        <form className="titan-signin-form" onSubmit={submit}>
          <label htmlFor="titan-login-name">USERNAME</label>
          <div className="titan-login-input">
            <UserRound size={22} aria-hidden="true" />
            <input id="titan-login-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="username" required />
          </div>
          <label htmlFor="titan-login-pin">PASSWORD</label>
          <div className="titan-login-input">
            <LockKeyhole size={21} aria-hidden="true" />
            <input id="titan-login-pin" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Enter your PIN" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" required aria-describedby="titan-login-hint" />
            <button type="button" className="titan-password-toggle" aria-label={showPin ? "Hide password" : "Show password"} aria-pressed={showPin} onClick={() => setShowPin(!showPin)}>{showPin ? <Eye size={20} /> : <EyeOff size={20} />}</button>
          </div>
          <div className="titan-login-options">
            <label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label>
            <button type="button" onClick={() => setHelp("Please contact your administrator to reset your PIN. Email password recovery is not connected in this trial.")}>Forgot password?</button>
          </div>
          {error && <p className="titan-login-message error" role="alert">{error}</p>}
          <button className="titan-login-submit" type="submit"><LogIn size={22} aria-hidden="true" /><span>LOGIN</span></button>
          <div className="titan-login-divider"><span>OR</span></div>
          <button className="titan-login-sso" type="button" onClick={() => setHelp("Single sign-on is not connected in this trial. Please use your full name and four-digit PIN to sign in.")}><ShieldCheck size={22} aria-hidden="true" /><span>LOGIN WITH SSO</span></button>
          {help && <p className="titan-login-message" role="status">{help}</p>}
          <p id="titan-login-hint" className="titan-login-hint">Trial access: use your full name and four-digit PIN.{management && <> <Link to="/employee">Employee sign in</Link></>}</p>
        </form>
        <footer className="titan-login-footer"><ShieldCheck size={35} aria-hidden="true" /><div><strong>{branding.companyName}</strong><span>Version 1.0.0 <b>|</b> © {new Date().getFullYear()}</span></div></footer>
      </section>
    </main>
  );
}
