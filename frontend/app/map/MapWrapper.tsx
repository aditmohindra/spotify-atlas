"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import GalaxyMap from "@/components/GalaxyMap";

export default function MapWrapper() {
  const searchParams = useSearchParams();
  const embedMode = searchParams.get("embed") ?? undefined;
  const [layer, setLayer] = useState<"vibe" | "scene">("vibe");

  return (
    <GalaxyMap
      embedMode={embedMode}
      layer={layer}
      onLayerChange={setLayer}
    />
  );
}
