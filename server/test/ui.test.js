import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
const bundle = await build({
  stdin: {
    contents: `
  import React from "react";
  import {renderToStaticMarkup} from "react-dom/server";
  import {MemoryRouter} from "react-router-dom";
  import App, {Shell} from "./client/src/App.jsx";
  import {Context} from "./client/src/ui.jsx";
  import {setTranslationLanguage} from "./client/src/staff-copy.js";
  import {NewsCard, NewsFilters, NewsEditorTools, homepageNews} from "./client/src/NewsTools.jsx";
  export function newsTools(bn, mode) {
    const value={bn,districts:[{code:"dhaka",bn:"ঢাকা",name:"Dhaka"}]};
    const items=Array.from({length:12},(_,i)=>({slug:"synthetic-"+i,title:"Synthetic story",titleBn:"পরীক্ষার সংবাদ",body:"Synthetic general public news information",bodyBn:"পরীক্ষার সাধারণ প্রকাশিত সংবাদ বিবরণ।",newsCategory:"alert",publishAt:"2026-10-01T00:00:00Z",videoMediaId:"a".repeat(24)}));
    return renderToStaticMarkup(<MemoryRouter><Context.Provider value={value}>{mode === "cards" ? <div>{homepageNews(items).map(item=><NewsCard key={item.slug} item={item} bn={bn}/>)}</div> : mode === "filters" ? <NewsFilters onApply={()=>{}}/> : <NewsEditorTools current={{title:"",titleBn:"",body:"",bodyBn:""}} setCurrent={()=>{}}/>}</Context.Provider></MemoryRouter>);
  }
  export function home(bn) {
    globalThis.localStorage = {getItem: key => key === "cw_language" ? (bn ? "bn" : "en") : null, setItem() {}};
    return renderToStaticMarkup(<MemoryRouter initialEntries={["/"]}><App /></MemoryRouter>);
  }
  export function panel(bn,role) {
    setTranslationLanguage(bn);
    globalThis.localStorage = {getItem:()=>null,setItem(){}};
    const value={bn,setBn(){},user:{name:bn?"পরীক্ষার কর্মী":"Test member",role},setUser(){}};
    return renderToStaticMarkup(<MemoryRouter initialEntries={[role === "super_admin" ? "/admin/dashboard" : "/staff/dashboard"]}><Context.Provider value={value}><Shell><p>{bn?"পরীক্ষার প্যানেল":"Test panel"}</p></Shell></Context.Provider></MemoryRouter>);
  }
`,
    loader: "jsx",
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  external: ["react", "react-dom/server", "react-router-dom"],
  loader: { ".css": "empty" },
  logLevel: "silent",
});
const compiled = { exports: {} };
new Function("module", "exports", "require", bundle.outputFiles[0].text)(
  compiled,
  compiled.exports,
  createRequire(import.meta.url),
);
const { home, panel, newsTools } = compiled.exports;
const visible = (html) =>
  html.replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ");

test("homepage renders exactly one reporting link and the selected language", () => {
  for (const bn of [true, false]) {
    const html = home(bn),
      text = visible(html);
    assert.equal((html.match(/href="\/report"/g) || []).length, 1);
    assert.ok(html.includes('href="/about"'));
    assert.ok(text.includes(bn ? "গুরুত্বপূর্ণ সংবাদ" : "In focus"));
    assert.ok(!text.includes(bn ? "Report an incident" : "অভিযোগ জানান"));
    if (bn) assert.ok(!/[A-Za-z]/.test(text.replace(/EN/g, "")), text);
    else assert.ok(!/[\u0980-\u09ff]/.test(text.replace(/বাংলা/g, "")), text);
  }
});
test("administrator and staff layouts omit public chrome and localize workspace labels", () => {
  for (const role of ["super_admin", "moderator"])
    for (const bn of [true, false]) {
      const html = panel(bn, role),
        text = visible(html);
      assert.ok(!html.includes("<footer"));
      assert.ok(!html.includes('class="topbar"'));
      assert.ok(!html.includes('class="utility-bar'));
      assert.ok(html.includes('class="panel-header"'));
      assert.ok(html.includes('href="/staff/account"'));
      if (bn) assert.ok(!/[A-Za-z]/.test(text.replace(/EN/g, "")), text);
      else assert.ok(!/[\u0980-\u09ff]/.test(text.replace(/বাংলা/g, "")), text);
    }
});
test("eight compact news cards, search filters and missing translation warning render in both languages", () => {
  for (const bn of [true, false]) {
    const cards = newsTools(bn, "cards");
    assert.equal((cards.match(/class="news-card"/g) || []).length, 8);
    assert.ok(cards.includes(bn ? "ভিডিও" : "Video"));
    const filters = newsTools(bn, "filters");
    assert.ok(
      filters.includes('name="district"') && filters.includes('name="from"'),
    );
    assert.ok(filters.includes(bn ? "ঢাকা" : "Dhaka"));
    const editor = newsTools(bn, "editor");
    assert.ok(
      editor.includes(
        bn ? "প্রকাশের আগে বাংলা ও ইংরেজি" : "Complete Bengali and English",
      ),
    );
    for (const html of [cards, filters, editor]) {
      const text = visible(html);
      if (bn) assert.ok(!/[A-Za-z]/.test(text), text);
      else assert.ok(!/[\u0980-\u09ff]/.test(text), text);
    }
  }
});
