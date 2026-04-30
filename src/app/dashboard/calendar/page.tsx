export const runtime = 'edge';

import { Calendar } from "lucide-react";
import CalendarView from "./calendar-view";

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Content Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View, manage, and reschedule your upcoming posts across all platforms.
        </p>
      </div>

      <CalendarView />
    </div>
  );
}
