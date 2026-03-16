import { useChartStore } from "../stores/chartStore";
import ChartList from "./ChartList";
import ChartBuilder from "./ChartBuilder";
import ChartViewer from "./ChartViewer";

export default function OutputChart() {
  const view = useChartStore((s) => s.view);

  switch (view) {
    case "builder":
      return <ChartBuilder />;
    case "viewer":
      return <ChartViewer />;
    default:
      return <ChartList />;
  }
}
