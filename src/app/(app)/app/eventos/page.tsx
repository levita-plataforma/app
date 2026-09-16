import { CalendarDays } from "lucide-react";
import ModulePlaceholder from "@/components/shell/ModulePlaceholder";

export default function Page() {
  return (
    <ModulePlaceholder
      icon={CalendarDays}
      title="Eventos"
      description="Organiza y gestiona."
    />
  );
}
