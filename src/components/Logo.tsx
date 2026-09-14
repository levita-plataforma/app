export function BrandMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 36 44" fill="none" aria-hidden="true"><path d="M5 40V19C5 10 10 5 18 3c8 2 13 7 13 16v21" stroke="currentColor" strokeWidth="2.5"/><path d="M18 13v18M12 19h12" stroke="currentColor" strokeWidth="2.5"/></svg>;
}

export default function Logo({ small = false }: { small?: boolean }) {
  return <div className={`logo${small ? " logo--small" : ""}`} aria-label="LEVITA"><BrandMark/><span>LEVITA</span></div>;
}
