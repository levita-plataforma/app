import AuthCard from "@/components/shell/AuthCard";
import InvitacionPersonaForm from "./InvitacionPersonaForm";
import "../../../app-shell.css";

export default async function InvitacionPersonaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthCard title="Activa tu acceso" subtitle="Te han invitado a crear tu cuenta en LEVITA.">
      <InvitacionPersonaForm token={token} />
    </AuthCard>
  );
}
