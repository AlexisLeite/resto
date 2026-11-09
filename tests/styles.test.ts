import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)],
  );
}
test("La UI consume tokens; colores literales solo en temas", () => {
  const css = [...files("src/styles"), "src/app/globals.css"].filter((f) =>
    f.endsWith(".css"),
  );
  for (const file of css.filter((f) => !f.includes("/themes/"))) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      file,
    );
  }
  for (const file of [...files("src/components"), ...files("src/app")].filter(
    (f) => f.endsWith(".tsx"),
  )) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /style=\{|(?:bg|text|border|rounded|p|px|py|m|mx|my)-(?:\d|slate|stone|emerald|white|black)/,
      file,
    );
  }
  const declared = new Set(
    css.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
        (m) => m[1],
      ),
    ),
  );
  for (const file of css)
    for (const match of readFileSync(file, "utf8").matchAll(
      /var\((--[a-z0-9-]+)/g,
    )) {
      assert.ok(
        declared.has(match[1]),
        `${file}: token sin declarar ${match[1]}`,
      );
    }
});
