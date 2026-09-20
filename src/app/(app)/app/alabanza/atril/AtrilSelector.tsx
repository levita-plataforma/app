import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import type { WorshipRepertoire } from "@/server/worship/worship-service";

export default function AtrilSelector({
  repertoires,
  emptyMessage,
}: {
  repertoires: WorshipRepertoire[];
  emptyMessage?: string;
}) {
  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/alabanza" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Atril</h1>
      </section>

      <section className="shell-card" style={{ padding: 20 }}>
        {repertoires.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>{emptyMessage ?? "Aún no hay un repertorio disponible para abrir."}</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Elige un repertorio</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {repertoires.map((repertoire) => (
                <li key={repertoire.id}>
                  <Link
                    href={`/app/alabanza/atril?repertorio=${repertoire.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: "var(--shell-radius-sm)",
                      border: "1px solid var(--shell-border)",
                      textDecoration: "none",
                      color: "var(--shell-text)",
                    }}
                  >
                    <BookOpen size={16} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{repertoire.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
