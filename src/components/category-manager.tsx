"use client";
import { useState, useRef, useLayoutEffect, useCallback, useId } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus } from "lucide-react";
import type { ModuleProps } from "./dashboard";
import { ActionForm, Button, Empty, Field, value } from "./ui/primitives";
import { Dialog } from "./ui/dialog";
import { AnimatePresence, FadeView, useMotionTokens } from "./ui/motion";

type Category = ModuleProps["data"]["categories"][number];
export function CategoryManager({
  data,
  run,
  close,
  inline = false,
}: ModuleProps & { close?: () => void; inline?: boolean }) {
  const dragContextId = useId();
  const [editor, setEditor] = useState<Category | "new" | null>(null);
  const category = editor === "new" ? null : editor;
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const motion = useMotionTokens();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = order ?? data.categories.map((c) => c.id);
  const categories = ids
    .map((id) => data.categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);
  const dragged = data.categories.find((c) => c.id === dragging);
  async function finishDrag({ active, over }: DragEndEvent) {
    setDragging(null);
    if (!over || active.id === over.id || saving) return;
    const from = ids.indexOf(String(active.id)),
      to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    setOrder(next);
    setSaving(true);
    try {
      await run({ type: "category.reorder", ids: next }, "");
    } finally {
      setOrder(null);
      setSaving(false);
    }
  }
  const [returnFocus, setReturnFocus] = useState("[data-category-create]");
  const changeEditor = (next: Category | "new" | null) => {
    if (next)
      setReturnFocus(
        next === "new"
          ? "[data-category-create]"
          : `[data-category-id="${next.id}"]`,
      );
    const focused = document.activeElement;
    if (focused instanceof HTMLElement)
      focused
        .closest("dialog")
        ?.querySelector<HTMLButtonElement>('[aria-label="Cerrar diálogo"]')
        ?.focus({ preventScroll: true });
    setEditor(next);
  };

  const form = (
    <ActionForm
      key={category?.id ?? "new"}
      submit={async (form) => {
        const ok = await run(
          {
            type: "category.save",
            ...(category ? { id: category.id } : {}),
            name: value(form, "name"),
          },
          category ? "Categoría actualizada." : "Categoría creada.",
        );
        if (ok) changeEditor(null);
        return ok;
      }}
    >
      <Field label="Nombre de la categoría">
        <input
          className="control"
          name="name"
          defaultValue={category?.name ?? ""}
          placeholder="Por ejemplo, Bebidas"
          required
          maxLength={100}
        />
      </Field>
      <footer className="category-manager__footer">
        <Button variant="secondary" onClick={() => changeEditor(null)}>
          Cancelar
        </Button>
        <Button type="submit">
          {category ? "Guardar categoría" : "Crear categoría"}
        </Button>
      </footer>
    </ActionForm>
  );
  const list = (
    <div className="category-manager__content">
      <div className="category-manager__toolbar">
        <span className="management-count">
          {data.categories.length} categorías
        </span>
        <Button data-category-create onClick={() => changeEditor("new")}>
          <Plus aria-hidden="true" /> Nueva categoría
        </Button>
      </div>
      <DndContext
        id={dragContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDragging(String(active.id))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={finishDrag}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Presioná Espacio para tomar la categoría, flechas para moverla, Espacio para soltar y Escape para cancelar.",
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Moviendo ${data.categories.find((c) => c.id === active.id)?.name}.`,
            onDragOver: ({ over }) =>
              over
                ? `Posición ${ids.indexOf(String(over.id)) + 1} de ${ids.length}.`
                : undefined,
            onDragEnd: () => "Categoría soltada.",
            onDragCancel: () => "Movimiento cancelado.",
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="category-manager__list" aria-busy={saving}>
            {categories.map((c) => (
              <SortableCategory
                key={c.id}
                category={c}
                count={
                  data.products.filter((p) => p.categoryId === c.id).length
                }
                disabled={saving || ids.length < 2}
                edit={() => changeEditor(c)}
              />
            ))}
            {!data.categories.length && (
              <Empty title="Sin categorías">
                Creá la primera para organizar tu carta.
              </Empty>
            )}
          </div>
        </SortableContext>
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay
              dropAnimation={{
                duration: motion.list,
                easing: `cubic-bezier(${motion.ease.join(",")})`,
              }}
            >
              {dragged && (
                <div className="category-manager__drag-preview">
                  <GripVertical aria-hidden="true" />
                  <strong>{dragged.name}</strong>
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </div>
  );
  const content = (
    <FadeView
      viewKey={editor ? (category?.id ?? "new") : "list"}
      focusOnEnter={editor ? 'input[name="name"]' : returnFocus}
    >
      {editor ? form : list}
    </FadeView>
  );
  return inline ? (
    <section className="category-manager category-manager--inline">
      {list}
      <AnimatePresence>
        {editor && (
          <Dialog
            key={category?.id ?? "new"}
            title={category ? "Editar categoría" : "Nueva categoría"}
            initialFocus={'input[name="name"]'}
            close={() => changeEditor(null)}
            className="category-manager"
          >
            {form}
          </Dialog>
        )}
      </AnimatePresence>
    </section>
  ) : (
    <Dialog
      title={
        editor
          ? category
            ? "Editar categoría"
            : "Nueva categoría"
          : "Administrar categorías"
      }
      close={close ?? (() => {})}
      className="category-manager"
    >
      {content}
    </Dialog>
  );
}

function SortableCategory({
  category,
  count,
  disabled,
  edit,
}: {
  category: Category;
  count: number;
  disabled: boolean;
  edit: () => void;
}) {
  const motion = useMotionTokens();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    disabled,
    transition: {
      duration: motion.list,
      easing: `cubic-bezier(${motion.ease.join(",")})`,
    },
  });
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  useLayoutEffect(() => {
    if (nodeRef.current) {
      nodeRef.current.style.transform = CSS.Translate.toString(transform) ?? "";
      nodeRef.current.style.transition = transition ?? "";
    }
  }, [transform, transition]);
  return (
    <div
      ref={ref}
      className={`category-manager__row${isDragging ? " category-manager__row--dragging" : ""}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="button button--ghost button--icon category-manager__drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${category.name}`}
        title="Arrastrar para reordenar"
        disabled={disabled}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <div className="category-manager__identity">
        <strong>{category.name}</strong>
        <span>
          {count} {count === 1 ? "producto" : "productos"}
        </span>
      </div>
      <Button
        variant="secondary"
        className="button--icon"
        data-category-id={category.id}
        aria-label={`Editar categoría ${category.name}`}
        title={`Editar ${category.name}`}
        onClick={edit}
      >
        <Pencil aria-hidden="true" />
      </Button>
    </div>
  );
}
