import { translate } from "./staff-copy";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useApp, Alert, Loading, PageTitle, Text } from "./ui";
export function useFeature(url, headers) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError("");
    setData(null);
    api(url, {
      headers,
    })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [url, tick, JSON.stringify(headers || {})]);
  return {
    data,
    error,
    reload: () => setTick((n) => n + 1),
  };
}
export function useDeviceStore(key, initial = []) {
  const [value, setValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? initial;
    } catch {
      return initial;
    }
  });
  const save = (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return [value, save];
}
export function ThemeToggle() {
  const { bn } = useApp(),
    [theme, setTheme] = useDeviceStore("cw_theme", "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={translate(bn ? "থিম পরিবর্তন" : "Change theme")}
      aria-pressed={theme === "dark"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Text
        value={theme === "dark" ? (bn ? "দিন" : "Light") : bn ? "রাত" : "Dark"}
      />
    </button>
  );
}
export function SavedFilters({ scope, query, onLoad }) {
  const { bn } = useApp(),
    [saved, setSaved] = useDeviceStore("cw_filters_" + scope),
    [name, setName] = useState(""),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState("");
  return (
    <div className="saved-filter-tools no-print">
      <label>
        <Text value={bn ? "ফিল্টারের নাম" : "Filter name"} />
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="button outline small"
        disabled={!name.trim()}
        onClick={() => {
          setSaved(
            [
              ...saved.filter((s) => s.name !== name.trim()),
              {
                name: name.trim(),
                query: String(query),
              },
            ].slice(-20),
          );
          setName("");
          setMessage(bn ? "এই browser-এ সংরক্ষিত" : "Saved in this browser");
        }}
      >
        <Text value={bn ? "ফিল্টার সংরক্ষণ" : "Save filter"} />
      </button>
      <label>
        <Text value={bn ? "সংরক্ষিত ফিল্টার" : "Saved filters"} />
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const found = saved.find((s) => s.name === e.target.value);
            if (found) onLoad(found.query);
          }}
        >
          <option value="">
            <Text value={bn ? "নির্বাচন করুন" : "Choose"} />
          </option>
          {saved.map((s) => (
            <option key={s.name} value={s.name}>
              <Text value={s.name} />
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button outline small"
        disabled={!selected}
        onClick={() => {
          setSaved(saved.filter((s) => s.name !== selected));
          setSelected("");
        }}
      >
        <Text value={bn ? "ফিল্টার সরান" : "Remove filter"} />
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
export function ShareLink({ url, label }) {
  const { bn } = useApp(),
    [message, setMessage] = useState("");
  return (
    <div className="share-tools no-print">
      <button
        type="button"
        className="button outline small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setMessage(bn ? "লিংক কপি হয়েছে" : "Link copied");
          } catch {
            setMessage(url);
          }
        }}
      >
        {label || (bn ? "লিংক কপি" : "Copy link")}
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
export function BookmarkButton({ id }) {
  const { bn } = useApp(),
    [ids, setIds] = useDeviceStore("cw_bookmarks");
  return (
    <button
      type="button"
      className="button outline small no-print"
      aria-pressed={ids.includes(id)}
      onClick={() =>
        setIds(
          ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids, id].slice(-100),
        )
      }
    >
      <Text
        value={
          ids.includes(id)
            ? bn
              ? "বুকমার্ক সরান"
              : "Remove bookmark"
            : bn
              ? "বুকমার্ক"
              : "Bookmark"
        }
      />
    </button>
  );
}
function SavedCase({ id }) {
  const { data, error } = useFeature("/public/cases/" + encodeURIComponent(id));
  return error ? (
    <p>
      <Text value={"Public account unavailable"} />
    </p>
  ) : !data ? (
    <Loading />
  ) : (
    <article className="card">
      <h3>
        <Link to={"/incidents/" + id}>{data.entry.title}</Link>
      </h3>
      <p>{data.entry.summary}</p>
      <BookmarkButton id={id} />
    </article>
  );
}
export function BookmarksPage() {
  const { bn } = useApp(),
    [ids] = useDeviceStore("cw_bookmarks");
  return (
    <div className="container section">
      <PageTitle title={translate(bn ? "আপনার বুকমার্ক" : "Your bookmarks")}>
        <Text
          value={
            bn
              ? "শুধু এই browser-এ reference থাকে; প্রত্যাহার করা বিবরণ দেখানো হয় না।"
              : "References stay in this browser; withdrawn accounts are not displayed."
          }
        />
      </PageTitle>
      <div className="case-grid">
        {ids.map((id) => (
          <SavedCase key={id} id={id} />
        ))}
      </div>
      {!ids.length && (
        <p>
          <Text value={bn ? "কোনো বুকমার্ক নেই" : "No bookmarks saved"} />
        </p>
      )}
    </div>
  );
}
export function PublicSummary() {
  const { bn } = useApp(),
    { data, error } = useFeature("/features/public/summary");
  return (
    <div className="container section">
      <PageTitle
        title={translate(bn ? "মাসিক সারসংক্ষেপ" : "Monthly public summary")}
      >
        <Text
          value={
            bn
              ? "শুধু সম্মতিসহ স্বাধীনভাবে অনুমোদিত বিবরণ; এটি অপরাধের হার নয়।"
              : "Only consented independently approved accounts; these are not crime rates."
          }
        />
      </PageTitle>
      {error && <Alert error>{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="card">
            <table>
              <caption>
                <Text
                  value={
                    bn
                      ? "মাসভিত্তিক প্রকাশযোগ্য বিবরণ"
                      : "Publishable accounts by month"
                  }
                />
              </caption>
              <thead>
                <tr>
                  <th>
                    <Text value={bn ? "মাস" : "Month"} />
                  </th>
                  <th>
                    <Text value={bn ? "প্রকাশযোগ্য সংখ্যা" : "Visible count"} />
                  </th>
                  <th>
                    <Text value={bn ? "প্রবণতা" : "Trend"} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>
                      <Text
                        value={
                          m.withheld
                            ? bn
                              ? "গোপন রাখা হয়েছে"
                              : "Withheld"
                            : m.count
                        }
                      />
                    </td>
                    <td>
                      {!m.withheld && (
                        <meter
                          min="0"
                          max={Math.max(
                            1,
                            ...data.months.map((x) => x.count || 0),
                          )}
                          value={m.count}
                          aria-label={`${m.month}: ${m.count}`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.months.length && (
              <p>
                <Text
                  value={
                    bn ? "এখনো প্রকাশযোগ্য তথ্য নেই" : "No publishable data yet"
                  }
                />
              </p>
            )}
          </div>
          <p>
            <Text
              value={
                bn
                  ? "ছোট দলের সংখ্যা গোপন থাকে। Chart-এ গোপন সংখ্যাকে শূন্য ধরা হয় না।"
                  : "Small groups are withheld. Hidden counts are not treated as zero in the chart."
              }
            />
          </p>
        </>
      )}
    </div>
  );
}
export function FeedbackForm({ id }) {
  const { bn } = useApp(),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="card no-print">
      <summary>
        <Text
          value={
            bn
              ? "সংশোধন / ক্ষতিকর তথ্য জানান"
              : "Request correction / report harmful content"
          }
        />
      </summary>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = Object.fromEntries(new FormData(e.target));
          try {
            const d = await api(`/features/public/cases/${id}/feedback`, {
              method: "POST",
              body: f,
            });
            setMessage(
              (bn ? "Review reference: " : "Review reference: ") + d.reference,
            );
            e.target.reset();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <Text value={bn ? "অনুরোধের ধরন" : "Request type"} />
          <select name="kind">
            <option value="correction">
              <Text value={bn ? "সংশোধন" : "Correction"} />
            </option>
            <option value="harmful_content">
              <Text
                value={
                  bn
                    ? "ক্ষতিকর / পরিচয় প্রকাশকারী তথ্য"
                    : "Harmful / identifying content"
                }
              />
            </option>
          </select>
        </label>
        <label>
          <Text
            value={
              bn
                ? "কী পরিবর্তন প্রয়োজন? ব্যক্তিগত পরিচয় দেবেন না।"
                : "What needs review? Avoid private identities."
            }
          />
          <textarea
            name="description"
            required
            minLength={3}
            maxLength={4000}
            rows={4}
          />
        </label>
        <div className="honeypot" aria-hidden="true">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button className="button small" disabled={busy}>
          <Text value={bn ? "পর্যালোচনার জন্য পাঠান" : "Send for review"} />
        </button>
        {error && <Alert error>{error}</Alert>}
        {message && <Alert>{message}</Alert>}
      </form>
    </details>
  );
}
export function CaseExtras({ entry }) {
  const { bn } = useApp(),
    { data } = useFeature(`/features/public/cases/${entry.id}/related`);
  return (
    <>
      <div className="actions no-print">
        <BookmarkButton id={entry.id} />
        <ShareLink
          url={`${location.origin}/api/v1/features/public/share/${entry.id}`}
          label={bn ? "Share link" : "Share link"}
        />
        <button
          type="button"
          className="button outline small"
          onClick={() => window.print()}
        >
          <Text value={bn ? "প্রিন্ট / PDF" : "Print / PDF"} />
        </button>
      </div>
      <p className="muted">
        <Text value={bn ? "সর্বশেষ public review" : "Latest public review"} />:{" "}
        {new Date(entry.reviewedAt || entry.publishedAt).toLocaleString(
          bn ? "bn-BD" : "en-GB",
        )}
      </p>
      <details className="card">
        <summary>
          <Text
            value={
              bn ? "Review label কী বোঝায়?" : "What do review labels mean?"
            }
          />
        </summary>
        <p>
          <Text
            value={
              bn
                ? "পর্যালোচিত: পরিচয়মুক্ত লেখা স্বাধীন reviewer অনুমোদন করেছেন; এটি অভিযোগ সত্য হওয়ার প্রমাণ নয়। স্বাধীনভাবে যাচাইকৃত: প্রকাশিত পদ্ধতি অনুযায়ী অতিরিক্ত যাচাই হয়েছে।"
                : "Reviewed: an independent reviewer approved the redacted text; this does not prove the allegation. Independently verified: additional checking was performed using the published method."
            }
          />
        </p>
      </details>
      <FeedbackForm id={entry.id} />
      {data?.items.length > 0 && (
        <section className="mt">
          <h2>
            <Text
              value={
                bn ? "সংশ্লিষ্ট প্রকাশিত বিবরণ" : "Related public accounts"
              }
            />
          </h2>
          <div className="case-grid">
            {data.items.map((r) => (
              <article className="card" key={r.id}>
                <h3>
                  <Link to={"/incidents/" + r.id}>{r.title}</Link>
                </h3>
                <p>{r.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
export function ManagedPublicContent({ page, kind }) {
  const { bn } = useApp(),
    { data } = useFeature(
      `/features/public/content?${new URLSearchParams({
        ...(page
          ? {
              page,
            }
          : {}),
        ...(kind
          ? {
              kind,
            }
          : {}),
      })}`,
    );
  const items = (data?.items || []).filter(
    (c) => !["section", "category", "news"].includes(c.kind),
  );
  if (!items.length) return null;
  return (
    <section className="container section managed-content">
      <div className="case-grid">
        {items.map((c) =>
          c.kind === "faq" ? (
            <details className="card" key={c.slug}>
              <summary>
                {bn
                  ? c.titleBn || "এই ভাষায় তথ্য এখনো প্রকাশিত হয়নি।"
                  : c.title}
              </summary>
              <p className="description-text">
                {bn
                  ? c.bodyBn || "বাংলা তথ্য প্রকাশিত হলে এখানে দেখাবে।"
                  : c.body}
              </p>
            </details>
          ) : (
            <article
              className={
                "card " + (c.kind === "announcement" ? "announcement" : "")
              }
              key={c.slug}
            >
              <h2>
                {bn
                  ? c.titleBn || "এই ভাষায় তথ্য এখনো প্রকাশিত হয়নি।"
                  : c.title}
              </h2>
              <p className="description-text">
                {bn
                  ? c.bodyBn || "বাংলা তথ্য প্রকাশিত হলে এখানে দেখাবে।"
                  : c.body}
              </p>
              {c.url && (
                <a href={c.url} rel="noopener noreferrer" target="_blank">
                  <Text
                    value={
                      bn ? "অফিশিয়াল তথ্য খুলুন" : "Open official resource"
                    }
                  />{" "}
                  ↗
                </a>
              )}
            </article>
          ),
        )}
      </div>
    </section>
  );
}
export function HomeSections({ children }) {
  const { bn } = useApp(),
    { data } = useFeature("/features/public/layout"),
    ids = ["hero", "metrics", "process", "principles", "call-to-action"],
    sections = React.Children.toArray(children),
    custom = data?.items || [];
  const rows = sections.map((child, index) => ({
    child,
    id: ids[index],
    rank: custom.find((c) => c.slug === ids[index])?.rank ?? index * 10,
    enabled: custom.find((c) => c.slug === ids[index])?.enabled ?? true,
  }));
  for (const c of custom.filter((c) => !ids.includes(c.slug) && c.enabled))
    rows.push({
      id: c.slug,
      enabled: true,
      rank: c.rank,
      child: (
        <section className="container section">
          <article className="card">
            <h2>
              {bn ? c.titleBn || "এই ভাষায় তথ্য এখনো প্রকাশিত হয়নি।" : c.title}
            </h2>
            <p className="description-text">
              {bn
                ? c.bodyBn || "বাংলা তথ্য প্রকাশিত হলে এখানে দেখাবে।"
                : c.body}
            </p>
          </article>
        </section>
      ),
    });
  return (
    <>
      {rows
        .filter((r) => r.enabled)
        .sort((a, b) => a.rank - b.rank)
        .map((r) => (
          <React.Fragment key={r.id}>{r.child}</React.Fragment>
        ))}
    </>
  );
}
