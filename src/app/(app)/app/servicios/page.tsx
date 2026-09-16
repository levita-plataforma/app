import { CalendarClock } from "lucide-react";
import ModulePlaceholder from "@/components/shell/ModulePlaceholder";

export default function Page() {
  return (
    <ModulePlaceholder
      icon={CalendarClock}
      title="Servicios"
      description="Organiza turnos y equipos."
    />
  );
}
