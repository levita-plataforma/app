import AuthCard from "@/components/shell/AuthCard";
import InvitacionForm from "./InvitacionForm";
import "../../../app-shell.css";

export default async function InvitacionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthCard
      title="Completa tu acceso"
      subtitle="Te han invitado a activar tu iglesia en LEVITA. Crea tu acceso para continuar."
    >
      <InvitacionForm token={token} />
    </AuthCard>
  );
}
