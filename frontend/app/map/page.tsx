import { Suspense } from "react";
import MapWrapper from "./MapWrapper";

export const metadata = {
  title: "Galaxy · Spotify Atlas",
  description: "Every track in your library, visualized as a galaxy of sound.",
};

export default function MapPage() {
  return (
    <Suspense>
      <MapWrapper />
    </Suspense>
  );
}
