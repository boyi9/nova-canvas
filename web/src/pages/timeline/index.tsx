import { Timeline } from "@/canvas/components/timeline/Timeline";

export default function TimelinePage() {
  return (
    <div className="h-screen bg-background">
      <Timeline height={window.innerHeight - 60} />
    </div>
  );
}