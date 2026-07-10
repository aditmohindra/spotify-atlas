"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import NavBar from "./NavBar";

/**
 * On /  and /map/embed: no sidebar, full width.
 * On /map: top NavBar + no left sidebar (GalaxyMap handles its own Atlas Regions panel).
 * All other routes: 220px left Sidebar.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const isEmbed = pathname === "/map/embed";
  const isMap = pathname === "/map";

  if (isLanding || isEmbed) {
    return <>{children}</>;
  }

  if (isMap) {
    // Dark backdrop scoped to just this route — the body's global background
    // is the light site theme, which would otherwise bleed through NavBar's
    // translucent glass strip and wash it out to gray instead of blending
    // into the dark atlas below.
    return (
      <div style={{ background: "#050913", minHeight: "100vh" }}>
        <NavBar />
        {children}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, marginLeft: 220 }}>
        {children}
      </div>
    </div>
  );
}
