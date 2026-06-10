"use client";

import { useSearchParams } from "next/navigation";
import GalaxyMap from "@/components/GalaxyMap";

export default function MapWrapper() {
  const searchParams = useSearchParams();
  const embedMode = searchParams.get("embed") ?? undefined;
  return <GalaxyMap embedMode={embedMode} />;
}
