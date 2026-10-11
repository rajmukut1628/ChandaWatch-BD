import { NewsEditorTools } from "./NewsTools";
import { translate, languageLocale } from "./staff-copy";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useApp, PageTitle, Alert, Loading, Text } from "./ui";
import { useFeature } from "./FeaturePublic";
const root = "/features/admin";
const kinds = {
  news: ["সংবাদ ও গুরুত্বপূর্ণ তথ্য", "News and hot information"],
  faq: ["প্রশ্ন–উত্তর", "FAQ"],
  article: ["সচেতনতার লেখা", "Awareness articles"],
  resource: ["জরুরি সহায়তা", "Emergency resources"],
  announcement: ["ঘোষণা", "Announcements"],
  section: ["পরিচিতি পাতার অংশসমূহ", "About page sections"],
  category: ["ঘটনার ধরন", "Incident categories"],
};
const blank = (kind) => ({
  slug: "",
  kind,
  title: "",
  titleBn: "",
  body: "",
  bodyBn: "",
  url: "",
  page:
    kind === "article"
      ? "awareness"
      : kind === "resource"
        ? "safety"
        : kind === "section"
          ? "home"
          : "all",
  rank: 0,
  enabled: true,
  featured: false,
  newsCategory: "important",
  district: "",
  coverMediaId: null,
  videoMediaId: null,
  state: "draft",
  publishAt: null,
  revision: 0,
});
const permissions = [
  "review",
  "draft",
  "publish",
  "scan",
  "export",
  "communicate",
  "workflow",
];
export function ContentManager() {
  const { bn } = useApp(),
    { data, error, reload } = useFeature(root + "/content"),
    [kind, setKind] = useState("news"),
    [current, setCurrent] = useState(blank("news")),
    [versions, setVersions] = useState([]),
    [mutation, setMutation] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(url, method, body) {
    setBusy(true);
    setMutation("");
    try {
      const d = await api(root + url, {
        method,
        body,
      });
      window.dispatchEvent(new Event("cw-content-updated"));
      setMessage(bn ? "পরিবর্তন সংরক্ষিত" : "Changes saved");
      reload();
      return d;
    } catch (e) {
      setMutation(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function select(c) {
    setCurrent(c);
    setVersions([]);
    if (c._id) {
      try {
        const d = await api(root + `/content/${c._id}/versions`);
        setVersions(d.items);
      } catch (e) {
        setMutation(e.message);
      }
    }
  }
  return (
    <>
      <PageTitle title={translate(bn ? "Content manager" : "Content manager")}>
        <Text
          value={
            bn
              ? "FAQ, article, resources, ঘোষণা, homepage ও category; সাধারণ content ৩০ দিন trash থেকে ফেরত আনা যায়।"
              : "FAQ, articles, resources, announcements, homepage and categories; ordinary content can be restored from trash for 30 days."
          }
        />
      </PageTitle>
      {(error || mutation) && <Alert error>{error || mutation}</Alert>}
      {message && <Alert>{message}</Alert>}
      <div
        className="content-tabs"
        role="group"
        aria-label={translate(bn ? "Content ধরন" : "Content types")}
      >
        {Object.entries(kinds).map(([k, names]) => (
          <button
            className={"button " + (kind === k ? "" : "outline")}
            key={k}
            onClick={() => {
              setKind(k);
              setCurrent(blank(k));
              setVersions([]);
            }}
          >
            {names[bn ? 0 : 1]}
          </button>
        ))}
      </div>
      <div className="content-manager-grid">
        <section className="card">
          <h2>{kinds[kind][bn ? 0 : 1]}</h2>
          <button
            className="button outline small"
            onClick={() => select(blank(kind))}
          >
            <Text value={bn ? "নতুন যোগ" : "Add new"} />
          </button>
          {data?.items
            .filter((c) => c.kind === kind && c.state !== "trash")
            .map((c) => (
              <button
                className="content-list-item"
                key={c._id}
                onClick={() => select(c)}
              >
                <strong>{bn && c.titleBn ? c.titleBn : c.title}</strong>
                <span>
                  <Text value={c.state} /> · #{c.rank}{" "}
                  {c.publishAt &&
                    new Date(c.publishAt).toLocaleString(languageLocale())}
                </span>
              </button>
            ))}
          <h3>
            <Text value={bn ? "Recycle bin" : "Recycle bin"} />
          </h3>
          {data?.items
            .filter((c) => c.kind === kind && c.state === "trash")
            .map((c) => (
              <div className="message" key={c._id}>
                <strong>{bn ? c.titleBn || c.title : c.title}</strong>
                <p>{new Date(c.deletedAt).toLocaleString(languageLocale())}</p>
                <button
                  className="button outline small"
                  disabled={busy}
                  onClick={() =>
                    action(`/content/${c._id}/restore`, "POST", {})
                  }
                >
                  <Text
                    value={bn ? "খসড়া হিসেবে ফিরিয়ে আনুন" : "Restore as draft"}
                  />
                </button>
                <button
                  className="button outline danger small"
                  disabled={busy}
                  onClick={() => {
                    const confirmation = window.prompt(
                      bn
                        ? `স্থায়ীভাবে মুছতে এই নামটি লিখুন: ${c.slug}`
                        : `Type this name to permanently delete: ${c.slug}`,
                    );
                    if (confirmation === c.slug)
                      action(`/content/${c._id}/permanent`, "DELETE", {
                        slug: c.slug,
                        revision: c.revision,
                      });
                  }}
                >
                  {bn ? "স্থায়ীভাবে মুছুন" : "Delete permanently"}
                </button>
              </div>
            ))}
        </section>
        <section>
          <form
            className="card form-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const body = {
                ...current,
              };
              delete body._id;
              delete body.__v;
              delete body.createdAt;
              delete body.updatedAt;
              delete body.deletedAt;
              const d = await action("/content/" + body.slug, "PUT", body);
              if (d) select(d.item);
            }}
          >
            <h2>
              <Text
                value={
                  current.revision
                    ? bn
                      ? "Content সম্পাদনা"
                      : "Edit content"
                    : bn
                      ? "নতুন content"
                      : "New content"
                }
              />
            </h2>
            <label>
              <Text
                value={
                  bn ? "Slug (স্থায়ী reference)" : "Slug (permanent reference)"
                }
              />
              <input
                required
                pattern="[a-z][a-z0-9_-]{2,60}"
                value={current.slug}
                disabled={Boolean(current.revision)}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    slug: e.target.value,
                  })
                }
              />
            </label>
            {kind === "category" && (
              <small>
                <Text
                  value={
                    bn
                      ? "নিজস্ব category slug যোগ করতে পারেন। পুরোনো রিপোর্টের ধরন বদলাবে না।"
                      : "Add a custom category slug. Existing reports keep their category."
                  }
                />
              </small>
            )}
            {kind === "section" && (
              <small>
                {" "}
                <Text
                  value={
                    "hero \xB7 metrics \xB7 process \xB7 principles \xB7 call-to-action \u2014 or a custom section slug."
                  }
                />{" "}
              </small>
            )}
            {kind === "news" && (
              <NewsEditorTools
                current={current}
                setCurrent={setCurrent}
                onBusyChange={setBusy}
              />
            )}
            <div className="form-grid">
              <label>
                {" "}
                <Text value={"English title"} />{" "}
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={current.title}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      title: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {" "}
                <Text
                  value={
                    "\u09AC\u09BE\u0982\u09B2\u09BE \u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE"
                  }
                />{" "}
                <input
                  maxLength={150}
                  value={current.titleBn}
                  required={kind === "news" && current.state === "published"}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      titleBn: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              {" "}
              <Text value={"English information"} />{" "}
              <textarea
                required
                minLength={3}
                maxLength={10000}
                rows={5}
                value={current.body}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    body: e.target.value,
                  })
                }
              />
            </label>
            <label>
              {" "}
              <Text
                value={
                  "\u09AC\u09BE\u0982\u09B2\u09BE \u09B2\u09C7\u0996\u09BE"
                }
              />{" "}
              <textarea
                maxLength={10000}
                rows={5}
                value={current.bodyBn}
                required={kind === "news" && current.state === "published"}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    bodyBn: e.target.value,
                  })
                }
              />
            </label>
            <label>
              <Text
                value={
                  bn
                    ? "অফিশিয়াল HTTPS link (ঐচ্ছিক)"
                    : "Official HTTPS link (optional)"
                }
              />
              <input
                type="url"
                value={current.url}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    url: e.target.value,
                  })
                }
              />
            </label>
            <div className="form-grid">
              <label>
                <Text value={bn ? "পাতা" : "Page"} />
                <select
                  value={current.page}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      page: e.target.value,
                    })
                  }
                >
                  {["home", "awareness", "safety", "privacy", "all"].map(
                    (p) => (
                      <option key={p} value={p}>
                        <Text
                          value={
                            p === "home" && kind !== "news"
                              ? "About the platform"
                              : p
                          }
                        />
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <Text value={bn ? "ক্রম" : "Order"} />
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={current.rank}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      rank: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                <Text value={bn ? "অবস্থা" : "State"} />
                <select
                  value={current.state}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      state: e.target.value,
                    })
                  }
                >
                  <option value="draft">
                    <Text value={bn ? "Draft" : "Draft"} />
                  </option>
                  <option value="published">
                    <Text value={bn ? "Published" : "Published"} />
                  </option>
                </select>
              </label>
              <label>
                <Text
                  value={
                    bn
                      ? "প্রকাশের সময় (ফাঁকা = এখন)"
                      : "Publish at (empty = now)"
                  }
                />
                <input
                  type="datetime-local"
                  value={
                    current.publishAt
                      ? new Date(
                          new Date(current.publishAt).getTime() -
                            new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      publishAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={current.enabled}
                onChange={(e) =>
                  setCurrent({
                    ...current,
                    enabled: e.target.checked,
                  })
                }
              />
              <Text value={bn ? "Enabled / দৃশ্যমান" : "Enabled / visible"} />
            </label>
            {kind === "news" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={current.featured === true}
                  onChange={(e) =>
                    setCurrent({
                      ...current,
                      featured: e.target.checked,
                    })
                  }
                />
                <Text
                  value={
                    bn
                      ? "গুরুত্বপূর্ণ সংবাদ হিসেবে মূল পাতায় দেখান"
                      : "Feature as hot news on the homepage"
                  }
                />
              </label>
            )}
            {kind === "news" && (
              <p>
                <Text
                  value={
                    bn
                      ? "দুই ভাষার শিরোনাম ও লেখা দিন। প্রকাশিত, দৃশ্যমান ও মূল পাতায় নির্বাচিত সংবাদই সেখানে দেখাবে। ক্রম দিয়ে অগ্রাধিকার ঠিক করুন; খসড়া, ভবিষ্যৎ সময় বা মুছে রাখা সংবাদ দেখা যাবে না।"
                      : "Provide both language versions. Only published, visible, featured news appears on the homepage. Set its priority using Order; drafts, future schedules and trash remain private."
                  }
                />
              </p>
            )}
            <p>
              <Text
                value={
                  bn
                    ? "Published text-এ ব্যক্তিগত পরিচয় দেবেন না। Scheduled লেখা সময় হওয়ার আগে public হবে না।"
                    : "Exclude private identities. Scheduled content stays private until its publication time."
                }
              />
            </p>
            <button className="button" disabled={busy}>
              <Text value={bn ? "সংরক্ষণ" : "Save content"} />
            </button>
            {current._id && (
              <button
                type="button"
                className="button outline danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      (bn
                        ? "এই তথ্যটি মুছে রাখবেন? "
                        : "Move this item to trash? ") +
                        (bn ? current.titleBn : current.title),
                    )
                  )
                    return;
                  const d = await action(`/content/${current._id}`, "DELETE", {
                    revision: current.revision,
                  });
                  if (d) {
                    setCurrent(blank(kind));
                    setVersions([]);
                  }
                }}
              >
                <Text value={bn ? "Trash-এ সরান" : "Move to trash"} />
              </button>
            )}
          </form>
          {versions.length > 0 && (
            <details className="card mt">
              <summary>
                <Text value={bn ? "আগের versions" : "Previous versions"} />
              </summary>
              {versions.map((v) => (
                <article className="message" key={v._id}>
                  <strong>
                    {bn
                      ? v.snapshot.titleBn || v.snapshot.title
                      : v.snapshot.title}
                  </strong>
                  <p>
                    {new Date(v.createdAt).toLocaleString(languageLocale())}{" "}
                    <Text value={"\xB7 Revision"} /> {v.snapshot.revision}
                  </p>
                  <details>
                    <summary>
                      <Text value={bn ? "লেখা দেখুন" : "View content"} />
                    </summary>
                    <p className="description-text">
                      {v.snapshot.bodyBn || v.snapshot.body}
                    </p>
                  </details>
                  <button
                    className="button outline small"
                    disabled={busy}
                    onClick={async () => {
                      const d = await action(
                        `/content/${current._id}/versions/${v._id}/restore`,
                        "POST",
                        {
                          revision: current.revision,
                        },
                      );
                      if (d) select(d.item);
                    }}
                  >
                    <Text
                      value={bn ? "Draft হিসেবে ফেরত" : "Restore as draft"}
                    />
                  </button>
                </article>
              ))}
            </details>
          )}
        </section>
      </div>
    </>
  );
}
export function AccessManager() {
  const { bn, user } = useApp(),
    { data, error, reload } = useFeature("/admin/users"),
    [mutation, setMutation] = useState(""),
    [message, setMessage] = useState("");
  return (
    <>
      <PageTitle
        title={translate(
          bn ? "Staff access ও suspension" : "Staff access and suspension",
        )}
      >
        <Text
          value={
            bn
              ? "Role-এর অনুমতি সীমিত করতে পারবেন; পরিবর্তনে পুরোনো session বন্ধ হয়।"
              : "Restrict role permissions; access changes revoke previous sessions."
          }
        />
      </PageTitle>
      {(error || mutation) && <Alert error>{error || mutation}</Alert>}
      {message && <Alert>{message}</Alert>}
      {data?.items
        .filter((u) => u.id !== user.id)
        .map((u) => (
          <form
            key={u.id + JSON.stringify(u.deniedPermissions) + u.accountStatus}
            className="card form-card mt"
            onSubmit={async (e) => {
              e.preventDefault();
              setMutation("");
              const f = new FormData(e.target);
              try {
                await api(root + `/users/${u.id}/access`, {
                  method: "PATCH",
                  body: {
                    deniedPermissions: f.getAll("denied"),
                    available: f.get("available") === "on",
                    reason: f.get("reason"),
                  },
                });
                if (f.get("status") !== u.accountStatus)
                  await api(`/admin/users/${u.id}`, {
                    method: "PATCH",
                    body: {
                      accountStatus: f.get("status"),
                    },
                  });
                setMessage(
                  bn
                    ? "Account update হয়েছে; sessions বন্ধ"
                    : "Account updated; sessions revoked",
                );
                reload();
              } catch (e) {
                setMutation(e.message);
              }
            }}
          >
            <h2>{u.name}</h2>
            <p>
              {u.email} · <Text value={u.role} />
            </p>
            <label>
              <Text value={bn ? "Account status" : "Account status"} />
              <select name="status" defaultValue={u.accountStatus}>
                <option value="active">
                  <Text value={bn ? "সক্রিয়" : "Active"} />
                </option>
                <option value="disabled">
                  <Text value={bn ? "স্থগিত" : "Suspended"} />
                </option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                name="available"
                defaultChecked={u.available !== false}
              />
              <Text
                value={
                  bn ? "Assignment নিতে পারবেন" : "Available for assignment"
                }
              />
            </label>
            <fieldset>
              <legend>
                <Text
                  value={bn ? "বন্ধ রাখা অনুমতি" : "Disabled permissions"}
                />
              </legend>
              {permissions.map((p) => (
                <label className="check-label" key={p}>
                  <input
                    type="checkbox"
                    name="denied"
                    value={p}
                    disabled={u.role === "super_admin"}
                    defaultChecked={u.deniedPermissions?.includes(p)}
                  />
                  <Text value={p} />
                </label>
              ))}
            </fieldset>
            <label>
              <Text value={bn ? "কারণ" : "Reason"} />
              <textarea name="reason" required minLength={10} maxLength={500} />
            </label>
            <button className="button">
              <Text value={bn ? "Access update" : "Update access"} />
            </button>
          </form>
        ))}
    </>
  );
}
export function FeedbackQueue() {
  const { bn } = useApp(),
    { data, error, reload } = useFeature(root + "/feedback"),
    [mutation, setMutation] = useState("");
  return (
    <>
      <PageTitle
        title={translate(
          bn ? "Public feedback review" : "Public feedback review",
        )}
      />
      {(error || mutation) && <Alert error>{error || mutation}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        data.items.map((f) => (
          <form
            className="card form-card mt"
            key={f.id + f.state}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.target);
              try {
                await api(root + `/feedback/${f.id}`, {
                  method: "PATCH",
                  body: {
                    state: form.get("state"),
                    resolution: form.get("resolution"),
                    hidePublic: form.get("hide") === "on",
                  },
                });
                reload();
              } catch (e) {
                setMutation(e.message);
              }
            }}
          >
            <h2>
              <Text value={f.kind} />
            </h2>
            <Link to={"/staff/reports/" + f.reportId}>{f.publicId}</Link>
            <p className="description-text">{f.description}</p>
            <p
              className={
                new Date(f.dueAt) < new Date() &&
                !["completed", "denied"].includes(f.state)
                  ? "deadline-overdue"
                  : ""
              }
            >
              <Text value={bn ? "Review deadline" : "Review deadline"} />:{" "}
              {new Date(f.dueAt).toLocaleString(languageLocale())}
            </p>
            <label>
              <Text value={bn ? "অবস্থা" : "State"} />
              <select
                name="state"
                defaultValue={f.state === "pending" ? "in_review" : f.state}
              >
                <option value="in_review">
                  <Text value={bn ? "পর্যালোচনায়" : "In review"} />
                </option>
                <option value="completed">
                  <Text value={bn ? "সম্পন্ন" : "Completed"} />
                </option>
                <option value="denied">
                  <Text value={bn ? "গ্রহণ হয়নি" : "Denied"} />
                </option>
              </select>
            </label>
            <label>
              <Text value={bn ? "Resolution" : "Resolution"} />
              <textarea
                name="resolution"
                required
                minLength={3}
                maxLength={4000}
                defaultValue={f.resolution}
              />
            </label>
            <label className="check-label">
              <input name="hide" type="checkbox" />
              <Text
                value={
                  bn
                    ? "Public বিবরণ লুকিয়ে নতুন review প্রয়োজন করুন"
                    : "Hide the public account pending new review"
                }
              />
            </label>
            <button className="button">
              <Text value={bn ? "সিদ্ধান্ত সংরক্ষণ" : "Save decision"} />
            </button>
          </form>
        ))
      )}
    </>
  );
}
export function OperationsPage() {
  const { bn } = useApp(),
    { data, error, reload } = useFeature(root + "/operations"),
    [mutation, setMutation] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function action(kind) {
    setBusy(true);
    setMutation("");
    try {
      await api(root + "/operations/" + kind, {
        method: "POST",
        body: {},
      });
      setMessage(bn ? "Operation সম্পন্ন" : "Operation completed");
      reload();
    } catch (e) {
      setMutation(e.message);
      reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title={translate(
          bn ? "Operations ও monitoring" : "Operations and monitoring",
        )}
      >
        <Text
          value={
            bn
              ? "Backup, scanner, storage, retention, privacy deadline ও safe errors"
              : "Backup, scanner, storage, retention, privacy deadlines and safe errors"
          }
        />
      </PageTitle>
      {(error || mutation) && <Alert error>{error || mutation}</Alert>}
      {message && <Alert>{message}</Alert>}
      <button className="button outline small" onClick={reload}>
        <Text value={bn ? "Refresh" : "Refresh"} />
      </button>
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="metric-grid">
            <article className="card">
              <h3>
                <Text
                  value={
                    bn ? "Encrypted disk storage" : "Encrypted disk storage"
                  }
                />
              </h3>
              <strong>
                {(data.diskBytes / 1024 / 1024).toFixed(1)}{" "}
                <Text value={"MB"} />
              </strong>
            </article>
            <article className="card">
              <h3>
                <Text value={bn ? "Scanner mode" : "Scanner mode"} />
              </h3>
              <strong>{data.scanner}</strong>
              <p>
                <Text
                  value={
                    data.scanner === "quarantine"
                      ? bn
                        ? "আসল scanner সংযুক্ত হয়নি"
                        : "Real scanner not connected"
                      : data.scannerHealth?.ok
                        ? bn
                          ? "Scanner সংযোগ সচল"
                          : "Scanner connection healthy"
                        : bn
                          ? "Scanner সংযোগ ব্যর্থ"
                          : "Scanner connection unavailable"
                  }
                />
              </p>
            </article>
            <article className="card">
              <h3>
                <Text value={bn ? "Email queue" : "Email queue"} />
              </h3>
              <p>
                <Text
                  value={
                    data.mail.configured
                      ? bn
                        ? "Configured"
                        : "Configured"
                      : bn
                        ? "SMTP সংযুক্ত হয়নি"
                        : "SMTP not connected"
                  }
                />
              </p>
              <strong>
                {data.mail.queued} <Text value={"queued \xB7"} />{" "}
                {data.mail.failed} <Text value={"failed"} />{" "}
              </strong>
            </article>
          </div>
          <section className="card mt">
            <h2>
              <Text
                value={bn ? "Backup ও retention" : "Backup and retention"}
              />
            </h2>
            <div className="actions">
              <button
                className="button"
                disabled={busy || !data.backupConfigured}
                onClick={() => action("backup")}
              >
                <Text
                  value={bn ? "Encrypted backup চালান" : "Run encrypted backup"}
                />
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => action("retention")}
              >
                <Text
                  value={bn ? "মেয়াদ শেষ তথ্য পরিষ্কার" : "Clean expired data"}
                />
              </button>
              <Link to="/admin/settings">
                <Text value={bn ? "Schedule settings" : "Schedule settings"} />
              </Link>
            </div>
            {!data.backupConfigured && (
              <Alert>
                <Text
                  value={
                    bn
                      ? "Backup key configure করা হয়নি"
                      : "Backup key is not configured"
                  }
                />
              </Alert>
            )}
            {data.jobs.map((j) => (
              <p key={j._id}>
                <Text value={j.kind} /> · <Text value={j.state} /> ·{" "}
                {new Date(j.startedAt).toLocaleString(languageLocale())}{" "}
                {j.code && `· ${j.code}`}
              </p>
            ))}
          </section>
          <section className="card mt">
            <h2>
              <Text value={bn ? "Scan queue" : "Scan queue"} />
            </h2>
            {data.evidence.map((s) => (
              <p key={s._id}>
                <Text value={s._id} /> · {s.count} ·{" "}
                {(s.bytes / 1024 / 1024).toFixed(1)} <Text value={"MB"} />{" "}
              </p>
            ))}
            {data.scanQueue.map((e) => (
              <div className="session-row" key={e._id}>
                <Link to={"/staff/reports/" + e.reportId}>
                  {e.mimeType} · {(e.fileSize / 1024 / 1024).toFixed(1)}{" "}
                  <Text value={"MB \xB7"} />{" "}
                  <Text value={e.malwareScanStatus} />
                </Link>
                <button
                  className="button outline small"
                  disabled={busy || data.scanner !== "clamav"}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/staff/evidence/${e._id}/scan`, {
                        method: "POST",
                        body: {},
                      });
                      reload();
                    } catch (e) {
                      setMutation(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Text value={bn ? "Rescan" : "Rescan"} />
                </button>
              </div>
            ))}
          </section>
          <section className="card mt">
            <h2>
              <Text
                value={
                  bn ? "Retention: আগামী ৩০ দিনে" : "Retention: next 30 days"
                }
              />
            </h2>
            {data.retention.map((r) => (
              <p key={r._id}>
                <Link to={"/staff/reports/" + r._id}>{r.trackingId}</Link> ·{" "}
                {new Date(r.expiresAt).toLocaleDateString(languageLocale())}
              </p>
            ))}
          </section>
          <section className="card mt">
            <h2>
              <Text
                value={
                  bn ? "Privacy request deadlines" : "Privacy request deadlines"
                }
              />
            </h2>
            {data.privacy.map((p) => (
              <p
                key={p._id}
                className={
                  new Date(p.dueAt) < new Date() ? "deadline-overdue" : ""
                }
              >
                {p.reference} · <Text value={p.state} /> ·{" "}
                {new Date(p.dueAt).toLocaleDateString(languageLocale())}
              </p>
            ))}
            <Link to="/admin/privacy-requests">
              <Text value={bn ? "Privacy queue খুলুন" : "Open privacy queue"} />
            </Link>
            <p>
              {data.feedbackOverdue}{" "}
              <Text
                value={
                  bn ? "Public feedback overdue" : "Public feedback overdue"
                }
              />
            </p>
          </section>
          <section className="card mt">
            <h2>
              <Text
                value={bn ? "Safe error monitoring" : "Safe error monitoring"}
              />
            </h2>
            <p>
              <Text
                value={
                  bn
                    ? "Narrative, secrets, contacts বা stack trace সংরক্ষণ হয় না।"
                    : "No narratives, secrets, contacts or stack traces are stored."
                }
              />
            </p>
            {data.errors.map((e) => (
              <p key={e._id}>
                {e.route} <Text value={"\xB7 HTTP"} /> <Text value={e.status} />{" "}
                · {e.count} ·{" "}
                {new Date(e.lastAt).toLocaleString(languageLocale())}
              </p>
            ))}
          </section>
        </>
      )}
    </>
  );
}
export function SettingsPage() {
  const { bn } = useApp(),
    { data, error, reload } = useFeature(root + "/settings"),
    [mutation, setMutation] = useState(""),
    [message, setMessage] = useState("");
  return (
    <>
      <PageTitle
        title={translate(bn ? "System settings" : "System settings")}
      />
      {(error || mutation) && <Alert error>{error || mutation}</Alert>}
      {message && <Alert>{message}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <form
          className="card form-card"
          key={JSON.stringify(data.settings)}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            try {
              await api(root + "/settings", {
                method: "PUT",
                body: {
                  intakeEnabled: f.get("intakeEnabled") === "on",
                  backupEnabled: f.get("backupEnabled") === "on",
                  retentionEnabled: f.get("retentionEnabled") === "on",
                  privacyDeadlineDays: Number(f.get("privacyDeadlineDays")),
                },
              });
              setMessage(bn ? "Settings সংরক্ষিত" : "Settings saved");
              reload();
            } catch (e) {
              setMutation(e.message);
            }
          }}
        >
          {["intakeEnabled", "backupEnabled", "retentionEnabled"].map((k) => (
            <label className="check-label" key={k}>
              <input
                name={k}
                type="checkbox"
                defaultChecked={data.settings[k] ?? k === "intakeEnabled"}
                disabled={k === "backupEnabled" && !data.backupConfigured}
              />
              <Text value={k} />
            </label>
          ))}
          <label>
            <Text
              value={
                bn
                  ? "Privacy request review সময় (দিন)"
                  : "Privacy request review deadline (days)"
              }
            />
            <input
              name="privacyDeadlineDays"
              type="number"
              min="1"
              max="90"
              defaultValue={data.settings.privacyDeadlineDays || 7}
            />
          </label>
          <p>
            <Text
              value={
                bn
                  ? "Enabled schedule প্রতি ২৪ ঘণ্টায় চলে, API চালু থাকা প্রয়োজন। Intake setting production launch gate bypass করতে পারে না।"
                  : "Enabled schedules run every 24 hours while the API is running. Intake settings cannot bypass the production launch gate."
              }
            />
          </p>
          <p>
            {" "}
            <Text value={"SMTP:"} />{" "}
            <Text
              value={
                data.emailDeliveryConfigured ? "configured" : "not configured"
              }
            />{" "}
            <Text value={"\xB7 Backup:"} />{" "}
            <Text
              value={data.backupConfigured ? "configured" : "not configured"}
            />{" "}
            <Text value={"\xB7 Scanner:"} /> {data.scanner}
          </p>
          <button className="button">
            <Text value={bn ? "সংরক্ষণ" : "Save settings"} />
          </button>
        </form>
      )}
    </>
  );
}
