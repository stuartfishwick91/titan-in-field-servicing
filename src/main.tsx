import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { App } from "./App";
import { BrandingProvider } from "./branding/BrandingContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrandingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<App />} />
          <Route path="*" element={<Navigate to="/management/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </BrandingProvider>
  </React.StrictMode>,
);
