import { Settings } from "lucide-react";
import ModulePlaceholder from "@/components/shell/ModulePlaceholder";

export default function Page() {
  return (
    <ModulePlaceholder
      icon={Settings}
      title="Configuración"
      description="Personaliza LEVITA para tu iglesia."
    />
  );
}
