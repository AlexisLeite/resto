<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Estilos de Resto

- Usar BEM en CSS; sin Tailwind ni estilos inline para valores estáticos.
- Colores literales solo en `src/styles/themes/`. El flujo es paleta → tokens semánticos → aliases de componentes → CSS BEM.
- Espaciado, fuentes, tamaños, radios, sombras, bordes, underline y scrollbars deben consumir tokens. Estados hover, active, focus, disabled, readonly y selected se definen explícitamente en los tokens.
- Reutilizar los controles y layouts de `src/components/ui` y `src/styles/ui.css`. Cada componente es dueño de su espaciado; evitar tarjetas anidadas con relleno duplicado.
- Verificar tema claro/oscuro en ambos sentidos y móvil. `pnpm test` audita colores y referencias a tokens.
- Etiquetas en español con tildes y ñ. PostgreSQL y Prisma son la fuente de verdad; verificar permisos en servidor y conservar historial de anulaciones.
