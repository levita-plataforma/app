import { ACTIVITY_STATUS_INFO, type ActivityStatus } from "@/lib/activities/constants";
import { chipClass } from "./describe";

export default function StatusChip({ status }: { status: ActivityStatus }) {
  const info = ACTIVITY_STATUS_INFO[status];
  return (
    <span className={chipClass(info.tone)} title={info.description}>
      {info.label}
    </span>
  );
}
