import { useEffect, useRef, useState } from "react";
import { useNavigationStore } from "../stores/navigationStore";
import PersonalRecords from "./PersonalRecords";
import Favorites from "./Favorites";
import MostRepeated from "./MostRepeated";

export default function InsightsTab() {
  const activeTab = useNavigationStore((s) => s.activeTab);
  const [refreshKey, setRefreshKey] = useState(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (activeTab === "insights") {
      if (wasActive.current) {
        // Re-entering the tab — bump the key to re-fetch
        setRefreshKey((k) => k + 1);
      }
      wasActive.current = true;
    }
  }, [activeTab]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PersonalRecords refreshKey={refreshKey} />
      <Favorites refreshKey={refreshKey} />
      <MostRepeated refreshKey={refreshKey} />
    </div>
  );
}
