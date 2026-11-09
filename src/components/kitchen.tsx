"use client";
import { useState } from "react";
import type { ModuleProps } from "./dashboard";
import { dateTime } from "@/lib/restaurant/shared";
import { SlideView } from "./ui/motion";
import { WorkspaceTabs } from "./ui/workspace-tabs";
import { Clock3 } from "lucide-react";
import { Empty, Panel } from "./ui/primitives";
import { OrderLine } from "./order-line";
export function Kitchen({ data, run }: ModuleProps) {
  const [station, setStation] = useState("ALL");
  const [direction, setDirection] = useState(1);
  const tickets = data.sessions
    .flatMap((s) =>
      s.orders.map((o) => ({
        ...o,
        tableName: s.tableName,
        items: o.items.filter(
          (i) =>
            (station === "ALL" || i.station === station) &&
            !["DELIVERED", "CANCELLED", "BILLABLE"].includes(i.status),
        ),
      })),
    )
    .filter((o) => o.items.length)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items = tickets.flatMap((o) => o.items);
  return (
    <>
      <WorkspaceTabs
        label="Estación"
        value={station}
        options={[
          { id: "ALL", label: "Todas" },
          { id: "KITCHEN", label: "Cocina" },
          { id: "BAR", label: "Barra" },
        ]}
        change={(next) => {
          setDirection(
            ["ALL", "KITCHEN", "BAR"].indexOf(next) >
              ["ALL", "KITCHEN", "BAR"].indexOf(station)
              ? 1
              : -1,
          );
          setStation(next);
        }}
      />
      <div className="kitchen-summary" aria-label="Estado de las comandas">
        <span>
          <strong>
            {items
              .filter((i) => i.status === "PENDING")
              .reduce((n, i) => n + i.quantity, 0)}
          </strong>{" "}
          Pendientes
        </span>
        <span>
          <strong>
            {items
              .filter((i) => i.status === "PREPARING")
              .reduce((n, i) => n + i.quantity, 0)}
          </strong>{" "}
          Preparando
        </span>
        <span>
          <strong>
            {items
              .filter((i) => i.status === "READY")
              .reduce((n, i) => n + i.quantity, 0)}
          </strong>{" "}
          Listos
        </span>
      </div>
      <SlideView
        viewKey={station}
        direction={direction}
        className="module-section-views"
      >
        <div className="kitchen-grid">
          {tickets.map((o) => (
            <Panel
              title={o.tableName}
              key={o.id}
              action={<span className="badge">#{o.id.slice(-5)}</span>}
            >
              <p className="kitchen-ticket__time">
                <Clock3 aria-hidden="true" />{" "}
                {dateTime(o.createdAt, data.restaurant.timezone)} ·{" "}
                {o.createdBy}
              </p>
              {o.items.map((i) => (
                <OrderLine
                  key={i.id}
                  item={i}
                  role={data.user.role}
                  run={run}
                  kitchen
                />
              ))}
            </Panel>
          ))}
        </div>
        {!tickets.length && (
          <Panel title="Comandas">
            <Empty title="Todo al día">
              Los nuevos pedidos aparecerán acá automáticamente.
            </Empty>
          </Panel>
        )}
      </SlideView>
    </>
  );
}
