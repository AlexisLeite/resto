"use client";
import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ProductView } from "@/lib/restaurant/queries";
import { type VarietySelection, money } from "@/lib/restaurant/shared";
import { ActionForm, Button, Field } from "../ui/primitives";
import { Dialog } from "../ui/dialog";
import type { Draft } from "./order-desk";
export function ProductCustomizer({
  product,
  line,
  currency,
  close,
  save,
}: {
  product: ProductView;
  line: Draft["lines"][number] | null;
  currency: string;
  close: () => void;
  save: (
    quantity: number,
    notes: string,
    addons: string[],
    varieties: VarietySelection[],
  ) => void;
}) {
  const groupId = useId();
  const [quantity, setQuantity] = useState(
    product.varieties.length ? 1 : (line?.quantity ?? 1),
  );
  const [notes, setNotes] = useState(line?.notes ?? "");
  const [addons, setAddons] = useState(line?.addonIds ?? []);
  const [varieties, setVarieties] = useState<VarietySelection[]>(() =>
    product.varieties.map((variety) => {
      const saved = line?.varieties.find((v) => v.varietyId === variety.id);
      const option =
        variety.options.find((o) => o.id === saved?.optionId) ??
        variety.options[0];
      return { varietyId: variety.id, optionId: option.id };
    }),
  );
  const unit =
    Math.round(Number(product.price) * 100) +
    product.addons
      .filter((a) => addons.includes(a.id))
      .reduce((n, a) => n + Math.round(Number(a.price) * 100), 0);
  return (
    <Dialog title={product.name} close={close} className="salon-customizer">
      <ActionForm
        className="salon-customizer__form"
        submit={async () => {
          save(quantity, notes, addons, varieties);
          return true;
        }}
      >
        <div className="salon-customizer__scroll">
          <div className="salon-customizer__intro">
            <p>{product.description}</p>
            <strong>
              {money(product.price, currency)}
              <span> por unidad</span>
            </strong>
          </div>
          <div className="salon-customizer__quantity">
            <span>Cantidad</span>
            <div className="salon-quantity">
              <Button
                variant="secondary"
                className="button--icon"
                aria-label="Restar una unidad"
                disabled={quantity <= 1}
                onClick={() => setQuantity(quantity - 1)}
              >
                <Minus />
              </Button>
              <input
                aria-label="Cantidad"
                className="control salon-quantity__input"
                type="number"
                min={1}
                max={50}
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
              <Button
                variant="secondary"
                className="button--icon"
                aria-label="Sumar una unidad"
                disabled={quantity >= 50}
                onClick={() => setQuantity(quantity + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          {line && product.varieties.length > 0 && line.quantity > 1 && (
            <p className="muted">
              Estás editando una unidad de las {line.quantity} de esta
              combinación.
            </p>
          )}
          {product.varieties.map((v) => {
            const selected =
              varieties.find((s) => s.varietyId === v.id)?.optionId ?? "";
            const choose = (optionId: string) =>
              setVarieties([
                ...varieties.filter((s) => s.varietyId !== v.id),
                { varietyId: v.id, optionId },
              ]);
            return v.options.length > 6 ? (
              <Field key={v.id} label={v.name}>
                <select
                  className="control"
                  required
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="" disabled>
                    Elegí una opción
                  </option>
                  {v.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <fieldset key={v.id} className="variety-switch">
                <legend className="variety-switch__legend">{v.name}</legend>
                <div className="variety-switch__options">
                  {v.options.map((o) => (
                    <label className="variety-switch__option" key={o.id}>
                      <input
                        className="variety-switch__input"
                        type="radio"
                        name={`${groupId}-${v.id}`}
                        required
                        value={o.id}
                        checked={selected === o.id}
                        onChange={() => choose(o.id)}
                      />
                      <span className="variety-switch__label">{o.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          {product.addons.length > 0 && (
            <fieldset className="salon-customizer__addons">
              <legend>
                Adicionales <span>Opcional</span>
              </legend>
              {product.addons.map((a) => (
                <label key={a.id} className="salon-addon">
                  <span>
                    <input
                      className="check__input"
                      type="checkbox"
                      checked={addons.includes(a.id)}
                      onChange={(e) =>
                        setAddons(
                          e.target.checked
                            ? [...addons, a.id]
                            : addons.filter((id) => id !== a.id),
                        )
                      }
                    />
                    {a.name}
                  </span>
                  <strong>+{money(a.price, currency)}</strong>
                </label>
              ))}
            </fieldset>
          )}
          <Field
            label="Notas para cocina"
            hint="Opcional. Se incluirán en la comanda."
          >
            <textarea
              className="control control--area"
              value={notes}
              maxLength={300}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sin cebolla, punto de cocción…"
            />
          </Field>
        </div>
        <footer className="salon-customizer__footer">
          <div className="salon-customizer__total">
            <span>
              Total de {quantity || 0} {quantity === 1 ? "unidad" : "unidades"}
            </span>
            <strong>{money((unit * (quantity || 0)) / 100, currency)}</strong>
          </div>
          <div className="salon-dialog-actions">
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit">
              {line ? "Guardar cambios" : "Sumar al pedido"}
            </Button>
          </div>
        </footer>
      </ActionForm>
    </Dialog>
  );
}
