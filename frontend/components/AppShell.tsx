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
    return (
      <>
        <NavBar />
        {children}
      </>
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
