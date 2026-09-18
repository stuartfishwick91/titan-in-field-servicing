import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { CloudGate } from "./cloud/CloudGate";
import { BrandingProvider } from "./branding/BrandingContext";
import "./styles.css";

// GitHub Pages serves static files without a fallback for application routes.
const Router = import.meta.env.MODE === "github-pages" ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrandingProvider>
      <Router>
        <Routes>
          <Route path="/*" element={<CloudGate><App /></CloudGate>} />
          <Route path="*" element={<Navigate to="/management/dashboard" replace />} />
        </Routes>
      </Router>
    </BrandingProvider>
  </React.StrictMode>,
);
