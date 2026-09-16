import { MessageCircle } from "lucide-react";
import ModulePlaceholder from "@/components/shell/ModulePlaceholder";

export default function Page() {
  return (
    <ModulePlaceholder
      icon={MessageCircle}
      title="Comunicación"
      description="Mantén la cercanía con tu comunidad."
    />
  );
}
