"use client";
import { Plus, Trash2 } from "lucide-react";
import type { Variety } from "@/lib/restaurant/shared";
import { AnimatedList } from "./ui/motion";
import { Button, Empty, uuid } from "./ui/primitives";
export function VarietiesEditor({
  value,
  change,
}: {
  value: Variety[];
  change: (value: Variety[]) => void;
}) {
  const update = (id: string, patch: Partial<Variety>) =>
    change(value.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  return (
    <section className="varieties-editor">
      <div className="varieties-editor__toolbar">
        <p>Opciones del mismo producto, sin cambiar su precio.</p>
        <Button
          variant="secondary"
          disabled={value.length >= 10}
          onClick={() =>
            change([
              ...value,
              {
                id: uuid(),
                name: "",
                options: [
                  { id: uuid(), name: "" },
                  { id: uuid(), name: "" },
                ],
              },
            ])
          }
        >
          <Plus aria-hidden="true" /> Variedad
        </Button>
      </div>
      <AnimatedList className="varieties-editor__groups" animateSize={false}>
        {value.map((v, i) => (
          <fieldset className="varieties-editor__group" key={v.id}>
            <div className="varieties-editor__name">
              <input
                className="control"
                aria-label={`Nombre de variedad ${i + 1}`}
                required
                maxLength={100}
                value={v.name}
                placeholder="Nombre: tamaño, línea…"
                onChange={(e) => update(v.id, { name: e.target.value })}
              />
              <Button
                variant="danger"
                className="button--icon"
                aria-label={`Quitar variedad ${i + 1}`}
                title="Quitar variedad"
                onClick={() => change(value.filter((x) => x.id !== v.id))}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <p className="varieties-editor__label">Opciones</p>
            <AnimatedList
              className="varieties-editor__options"
              animateSize={false}
            >
              {v.options.map((o, j) => (
                <div className="varieties-editor__option" key={o.id}>
                  <input
                    className="control"
                    aria-label={`Opción ${j + 1} de variedad ${i + 1}`}
                    required
                    maxLength={100}
                    value={o.name}
                    placeholder={`Opción ${j + 1}`}
                    onChange={(e) =>
                      update(v.id, {
                        options: v.options.map((x) =>
                          x.id === o.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    className="button--icon"
                    disabled={v.options.length <= 2}
                    aria-label={`Quitar opción ${j + 1} de variedad ${i + 1}`}
                    title={
                      v.options.length <= 2
                        ? "Se necesitan al menos dos opciones"
                        : "Quitar opción"
                    }
                    onClick={() =>
                      update(v.id, {
                        options: v.options.filter((x) => x.id !== o.id),
                      })
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </AnimatedList>
            <Button
              variant="secondary"
              disabled={v.options.length >= 30}
              onClick={() =>
                update(v.id, {
                  options: [...v.options, { id: uuid(), name: "" }],
                })
              }
            >
              <Plus aria-hidden="true" /> Opción
            </Button>
          </fieldset>
        ))}
      </AnimatedList>
      {!value.length && (
        <Empty title="Sin variedades">
          Agregá opciones de tamaño, cocción o presentación.
        </Empty>
      )}
    </section>
  );
}
