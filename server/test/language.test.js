import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
const path = new URL("../../client/src/staff-copy.js", import.meta.url);
const bundle = await build({
  entryPoints: [fileURLToPath(path)],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { translate, setTranslationLanguage, languageLocale, localizeError } =
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
const pairs = JSON.parse(
  await fs.readFile(
    new URL("../../client/src/language-pairs.json", import.meta.url),
    "utf8",
  ),
);

test("all registered bilingual interface messages translate without mixed English in Bengali", () => {
  for (const en of Object.keys(pairs)) {
    const bn = translate(en, true);
    assert.ok(/[\u0980-\u09ff]/.test(bn), en);
    assert.ok(!/[A-Za-z]/.test(bn), `${en}: ${bn}`);
    assert.ok(!/[\u0980-\u09ff]/.test(translate(pairs[en], false)), en);
  }
  for (const key of [
    "Dashboard",
    "Content manager",
    "English title",
    "বাংলা শিরোনাম",
    "Loading…",
    "New device signed in",
    "intakeEnabled",
    "super_admin",
    "Share link",
    "System settings",
  ])
    assert.ok(!/[A-Za-z]/.test(translate(key, true)), key);
  assert.equal(translate("বাংলা শিরোনাম", false), "Bengali title");
  assert.equal(translate("super_admin", false), "Administrator");
});
test("locale and safe API errors follow the active language", () => {
  setTranslationLanguage(true);
  assert.equal(languageLocale(), "bn-BD");
  assert.equal(translate("Dashboard"), "নিয়ন্ত্রণ পাতা");
  assert.equal(
    localizeError("Invalid sign-in credentials.", 401),
    "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
  );
  assert.ok(!/[A-Za-z]/.test(localizeError("An unknown server response", 409)));
  setTranslationLanguage(false);
  assert.equal(languageLocale(), "en-GB");
  assert.equal(translate("Dashboard"), "Dashboard");
  assert.equal(
    localizeError("Invalid sign-in credentials.", 401),
    "Invalid sign-in credentials.",
  );
  assert.equal(translate(200), 200);
});

test("static interface labels and accessible text have Bengali translations", async () => {
  const directory = new URL("../../client/src/", import.meta.url);
  for (const file of (await fs.readdir(directory)).filter((name) =>
    name.endsWith(".jsx"),
  )) {
    const ast = parse(await fs.readFile(new URL(file, directory), "utf8"), {
      sourceType: "module",
      plugins: ["jsx"],
    });
    const values = new Set();
    function walk(node, parent) {
      if (!node || typeof node !== "object") return;
      if (
        node.type === "JSXAttribute" &&
        node.name?.name === "value" &&
        parent?.name?.name === "Text"
      ) {
        const value =
          node.value?.type === "StringLiteral"
            ? node.value.value
            : node.value?.expression?.type === "StringLiteral"
              ? node.value.expression.value
              : null;
        if (value) values.add(value);
      }
      if (
        node.type === "CallExpression" &&
        node.callee?.name === "translate" &&
        node.arguments[0]?.type === "StringLiteral"
      )
        values.add(node.arguments[0].value);
      for (const [key, value] of Object.entries(node))
        if (key !== "loc" && key !== "comments") {
          if (Array.isArray(value)) value.forEach((child) => walk(child, node));
          else if (value && typeof value === "object") walk(value, node);
        }
    }
    walk(ast);
    for (const value of values) {
      if (!/[A-Za-z]/.test(value) || ["EN", "CW-…"].includes(value)) continue;
      assert.ok(!/[A-Za-z]/.test(translate(value, true)), `${file}: ${value}`);
    }
  }
});
