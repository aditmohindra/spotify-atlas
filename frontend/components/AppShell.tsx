"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

/**
 * Client-side layout shell. Wraps every page with the Sidebar and applies
 * the correct left margin so content clears the fixed sidebar panel.
 *
 * On /map the sidebar collapses to a 64-px icon-only strip so the galaxy
 * canvas gets maximum horizontal space.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/map";
  const sidebarWidth = isMap ? 64 : 220;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar compact={isMap} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          marginLeft: sidebarWidth,
        }}
      >
        {children}
      </div>
    </div>
  );
}
