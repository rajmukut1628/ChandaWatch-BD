import { translate } from "./staff-copy";
import { Text } from "./ui";
import React, { useEffect, useState } from "react";
import { api } from "./api";
import { PageTitle, Alert, Loading } from "./ui";
import { AdminDelete } from "./AdminTools";
export function AdminPageInfo() {
  const [items, setItems] = useState(null),
    [slug, setSlug] = useState("home"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  async function load() {
    try {
      const d = await api("/admin/page-info");
      setItems(d.items);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const item = items?.find((x) => x.slug === slug);
  return (
    <>
      <PageTitle
        eyebrow={translate("ADMINISTRATION")}
        title={translate("Public information")}
      >
        {" "}
        <Text
          value={
            "Add, edit or delete extra information on public pages. Drafts remain private until you publish them. Use the report review workflow for incident accounts."
          }
        />{" "}
      </PageTitle>
      {error && <Alert error>{error}</Alert>}
      {message && <Alert>{message}</Alert>}
      <div className="card">
        <label>
          {" "}
          <Text value={"Page"} />{" "}
          <select
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setMessage("");
            }}
          >
            {["home", "awareness", "safety", "privacy"].map((s) => (
              <option key={s} value={s}>
                <Text value={s === "home" ? "About the platform" : s} />
              </option>
            ))}
          </select>
        </label>
        {!items ? (
          <Loading />
        ) : (
          <>
            <form
              className="form-card mt"
              key={slug + revision}
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                setMessage("");
                const f = new FormData(e.currentTarget);
                try {
                  await api("/admin/page-info/" + slug, {
                    method: "PUT",
                    body: {
                      title: f.get("title"),
                      titleBn: f.get("titleBn"),
                      body: f.get("body"),
                      bodyBn: f.get("bodyBn"),
                      published: f.get("published") === "on",
                    },
                  });
                  setMessage("Information saved.");
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {" "}
                <Text value={"English title"} />{" "}
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={120}
                  defaultValue={item?.title || ""}
                />
              </label>
              <label>
                {" "}
                <Text value={"English information"} />{" "}
                <textarea
                  name="body"
                  required
                  minLength={10}
                  maxLength={10000}
                  rows={10}
                  defaultValue={item?.body || ""}
                />
              </label>
              <label>
                <Text value="Bengali title" />
                <input
                  name="titleBn"
                  maxLength={120}
                  defaultValue={item?.titleBn || ""}
                />
              </label>
              <label>
                <Text value="Bengali information" />
                <textarea
                  name="bodyBn"
                  maxLength={10000}
                  rows={7}
                  defaultValue={item?.bodyBn || ""}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={item?.published}
                />{" "}
                <Text
                  value={
                    "Publish this extra information on the selected public page"
                  }
                />{" "}
              </label>
              <small>
                {" "}
                <Text
                  value={
                    "Exclude private identities and raw report details. HTML is rendered as text."
                  }
                />{" "}
              </small>
              <button className="button" disabled={busy}>
                {" "}
                <Text value={"Save information"} />{" "}
              </button>
            </form>
            {item && (
              <div className="mt">
                <AdminDelete
                  url={"/admin/page-info/" + slug}
                  label={"Public information"}
                  onDeleted={() => {
                    load();
                    setMessage("Extra information removed.");
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
