import { createFileRoute } from "@tanstack/react-router";
import { OrbitSim } from "@/components/orbit/OrbitSim";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <OrbitSim />;
}
