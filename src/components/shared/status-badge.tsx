import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/lib/db/types";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  PackageCheck,
  Truck,
} from "lucide-react";

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    variant: "amber" | "blue" | "indigo" | "emerald" | "red";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  Unfulfilled: { variant: "amber", icon: Clock },
  Manifested: { variant: "blue", icon: PackageCheck },
  "In Transit": { variant: "indigo", icon: Truck },
  Delivered: { variant: "emerald", icon: CheckCircle2 },
  NDR: { variant: "red", icon: AlertTriangle },
  Cancelled: { variant: "red", icon: Ban },
};

export function StatusBadge({
  status,
  isOfd,
  isRto,
}: {
  status: OrderStatus;
  isOfd?: boolean;
  isRto?: boolean;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Unfulfilled;
  const Icon = cfg.icon;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <Badge variant={cfg.variant}>
        <Icon className="h-3 w-3" />
        <span>{status}</span>
      </Badge>
      {isOfd && status === "In Transit" && (
        <Badge variant="indigo" className="bg-violet-50 text-violet-700 border-violet-200">
          OFD
        </Badge>
      )}
      {isRto && (
        <Badge variant="red" className="bg-rose-50 text-rose-700 border-rose-200">
          RTO
        </Badge>
      )}
    </span>
  );
}

