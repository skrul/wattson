import { useEffect, useRef, useState } from "react";
import { useNavigationStore } from "../stores/navigationStore";
import { getSetting } from "../lib/database";
import CumulativeTotals from "./CumulativeTotals";
import WorkoutHeatmap from "./WorkoutHeatmap";
import EfficiencyFactor from "./EfficiencyFactor";
import PersonalRecords from "./PersonalRecords";
import Favorites from "./Favorites";
import MostRepeated from "./MostRepeated";

export default function InsightsTab() {
  const activeTab = useNavigationStore((s) => s.activeTab);
  const [refreshKey, setRefreshKey] = useState(0);
  const [experimentalEnabled, setExperimentalEnabled] = useState(false);
  const wasActive = useRef(false);

  useEffect(() => {
    if (activeTab === "insights") {
      getSetting("experimental_insights").then((v) => setExperimentalEnabled(v === "true")).catch(() => {});
      if (wasActive.current) {
        // Re-entering the tab — bump the key to re-fetch
        setRefreshKey((k) => k + 1);
      }
      wasActive.current = true;
    }
  }, [activeTab]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <CumulativeTotals refreshKey={refreshKey} />
      <WorkoutHeatmap refreshKey={refreshKey} />
      {experimentalEnabled && <EfficiencyFactor refreshKey={refreshKey} />}
      <PersonalRecords refreshKey={refreshKey} />
      <Favorites refreshKey={refreshKey} />
      <MostRepeated refreshKey={refreshKey} />
    </div>
  );
}
