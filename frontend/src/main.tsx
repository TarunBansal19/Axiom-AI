/// <reference types="vite/client" />
import { ClerkProvider } from "@clerk/react";
// @ts-ignore
import { shadcn } from "@clerk/themes";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      appearance={{ 
        theme: shadcn,
        variables: {
          colorBackground: '#22262B', // --shadow-grey
          // @ts-ignore
          colorInputBackground: '#1A1D21',
        },
        elements: {
          modalBackdrop: "flex items-center justify-center backdrop-blur-sm bg-black/40",
          footer: "bg-[#1c1f24] border-t border-white/10",
        }
      }} 
      afterSignOutUrl="/"
    >
      <App />
    </ClerkProvider>
  </React.StrictMode>
);