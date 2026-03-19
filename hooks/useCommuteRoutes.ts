import { useState, useEffect } from "react";
import commuteData from "../commutetour_data.json";

export type CommuteRoute = {
  id: string;
  origin: string;
  destination: string;
  schedule: string;
  fare: string;
  notes: string;
  transport: string;
};

export function useCommuteRoutes() {
  const [routes, setRoutes] = useState<CommuteRoute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      let parsed: CommuteRoute[] = [];
      const data: any = commuteData;
      const tables = data[0]?.tables || [];
      const routeTable = tables.find((t: any[]) => t[0]?.[0] === "Origin" && t[0]?.[1] === "Destination");
      
      if (routeTable) {
        parsed = routeTable.slice(1).map((row: string[], idx: number) => ({
          id: "route-" + idx,
          origin: row[0] || "",
          destination: row[1] || "",
          schedule: row[2] || "",
          fare: row[3] || "",
          notes: row[4] || "",
          transport: row[5] || "",
        }));
      }
      setRoutes(parsed);
    } catch (err) {
      console.warn("[useCommuteRoutes] Failed to load route data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { routes, loading };
}