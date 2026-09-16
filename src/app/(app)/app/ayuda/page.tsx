import { HelpCircle } from "lucide-react";
import ModulePlaceholder from "@/components/shell/ModulePlaceholder";

export default function Page() {
  return (
    <ModulePlaceholder
      icon={HelpCircle}
      title="Ayuda y soporte"
      description="Estamos aquí para ayudarte."
    />
  );
}
