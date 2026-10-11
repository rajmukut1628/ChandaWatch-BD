import { NewsCard, NewsFilters, newsMediaUrl, homepageNews } from "./NewsTools";
import { translate } from "./staff-copy";
import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp, Loading, Alert, Icon, Text } from "./ui";
import { useFeature } from "./FeaturePublic";
const copy = (item, bn, field) =>
  bn
    ? item[field + "Bn"] || "এই ভাষায় তথ্য এখনো প্রকাশিত হয়নি।"
    : item[field] || "This language version has not been published yet.";
const date = (item, bn) =>
  new Date(item.publishAt || item.updatedAt).toLocaleDateString(
    bn ? "bn-BD" : "en-GB",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );
export function NewsHome({ archive = false }) {
  const { bn } = useApp(),
    [page, setPage] = useState(1),
    [filters, setFilters] = useState({});
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  );
  const { data, error } = useFeature(
    `/features/public/news?page=${page}${archive ? "" : "&featured=true"}&${query}`,
  );
  const items = archive ? data?.items || [] : homepageNews(data?.items || []);
  return (
    <div className="news-home container">
      <section className="news-masthead">
        <div>
          <span className="news-kicker">
            <Text value={bn ? "চাঁদাওয়াচ সংবাদ" : "CHANDAWATCH JOURNAL"} />
          </span>
          <h1>
            <Text
              value={
                archive
                  ? bn
                    ? "সংবাদ সংগ্রহ"
                    : "News archive"
                  : bn
                    ? "গুরুত্বপূর্ণ সংবাদ"
                    : "In focus"
              }
            />
          </h1>
          <p>
            <Text
              value={
                bn
                  ? "জনসচেতনতার জন্য প্রশাসক নির্বাচিত সংবাদ ও প্রয়োজনীয় তথ্য।"
                  : "Administrator-selected news and essential information for public awareness."
              }
            />
          </p>
        </div>
        {!archive && (
          <Link className="button" to="/report">
            <Text value={bn ? "অভিযোগ জানান" : "Report an incident"} />
            <Icon.ArrowUpRight size={18} />
          </Link>
        )}
      </section>
      <div className="news-edition">
        <span>
          <Text
            value={
              bn
                ? "জনসচেতনতা • গুরুত্বপূর্ণ তথ্য"
                : "PUBLIC AWARENESS • ESSENTIAL UPDATES"
            }
          />
        </span>
        <span>
          {new Date().toLocaleDateString(bn ? "bn-BD" : "en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "Asia/Dhaka",
          })}
        </span>
      </div>
      {archive && (
        <NewsFilters
          onApply={(f) => {
            setFilters(f);
            setPage(1);
          }}
        />
      )}
      {error && <Alert error>{error}</Alert>}
      {!data && !error && (
        <>
          <Loading />
          <div className="news-grid" aria-hidden="true">
            {Array.from({ length: archive ? 10 : 8 }, (_, i) => (
              <div className="news-skeleton" key={i} />
            ))}
          </div>
        </>
      )}
      {data && !items.length && (
        <div className="news-empty" role="status">
          <Icon.FileText size={40} />
          <h2>
            <Text value={bn ? "কোনো সংবাদ পাওয়া যায়নি" : "No news found"} />
          </h2>
          <p>
            <Text
              value={
                bn
                  ? "প্রকাশিত সংবাদ এখানে দেখাবে। ফিল্টার ব্যবহার করলে অন্যভাবে খুঁজে দেখুন।"
                  : "Published stories appear here. If filters are applied, try another search."
              }
            />
          </p>
        </div>
      )}
      <section
        className="news-grid"
        aria-label={translate(bn ? "প্রকাশিত সংবাদ" : "Published news")}
      >
        {items.map((item) => (
          <NewsCard key={item.slug} item={item} bn={bn} />
        ))}
      </section>
      {archive && data?.pages > 1 && (
        <nav
          className="news-pagination"
          aria-label={translate(bn ? "সংবাদের পাতা" : "News pagination")}
        >
          <button
            className="button outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            <Text value={bn ? "আগের পাতা" : "Previous"} />
          </button>
          <span>
            {page.toLocaleString(bn ? "bn-BD" : "en-GB")} /{" "}
            {data.pages.toLocaleString(bn ? "bn-BD" : "en-GB")}
          </span>
          <button
            className="button outline"
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
          >
            <Text value={bn ? "পরের পাতা" : "Next"} />
          </button>
        </nav>
      )}
      {!archive && (
        <div className="news-bottom-links">
          <Link to="/news">
            <Text value={bn ? "সব সংবাদ" : "All news"} />
            <Icon.ArrowRight size={16} />
          </Link>
          <Link to="/about">
            <Text value={bn ? "প্ল্যাটফর্ম পরিচিতি" : "About the platform"} />
          </Link>
        </div>
      )}
    </div>
  );
}
export function NewsDetail() {
  const { bn } = useApp(),
    { slug } = useParams();
  const { data, error } = useFeature(`/features/public/news/${slug}`);
  return (
    <article className="news-detail container">
      <Link className="news-read" to="/">
        <Text value={bn ? "মূল পাতায় ফিরুন" : "Back to homepage"} />
      </Link>
      {error && <Alert error>{error}</Alert>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <span className="news-kicker">
            <Text value={bn ? "চাঁদাওয়াচ সংবাদ" : "CHANDAWATCH JOURNAL"} />
          </span>
          <h1>{copy(data.item, bn, "title")}</h1>
          <p className="news-detail-date">{date(data.item, bn)}</p>
          <div className="news-detail-rule" />
          {data.item.coverMediaId && (
            <img
              className="news-detail-cover"
              src={newsMediaUrl(data.item.coverMediaId)}
              alt=""
              decoding="async"
            />
          )}
          {data.item.videoMediaId && (
            <video
              className="news-detail-video"
              src={newsMediaUrl(data.item.videoMediaId)}
              poster={
                data.item.coverMediaId
                  ? newsMediaUrl(data.item.coverMediaId)
                  : undefined
              }
              controls
              preload="none"
              playsInline
              aria-label={bn ? "সংবাদের ভিডিও" : "News video"}
            />
          )}
          <div className="description-text news-detail-copy">
            {copy(data.item, bn, "body")}
          </div>
          {data.related?.length > 0 && (
            <section className="related-news">
              <h2>{bn ? "সম্পর্কিত সংবাদ" : "Related news"}</h2>
              <div className="news-grid">
                {data.related.map((item) => (
                  <NewsCard key={item.slug} item={item} bn={bn} />
                ))}
              </div>
            </section>
          )}
          {data.item.url && (
            <p>
              <a
                className="news-read"
                href={data.item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {bn ? "তথ্যসূত্র দেখুন" : "View source"}
                <Icon.ArrowUpRight size={17} />
              </a>
            </p>
          )}
          <p className="news-detail-note">
            <Text
              value={
                bn
                  ? "এই তথ্য জনসচেতনতার জন্য প্রকাশিত। জরুরি সহায়তার জন্য সংশ্লিষ্ট কর্তৃপক্ষের সঙ্গে যোগাযোগ করুন।"
                  : "Published for public awareness. Contact the appropriate authorities for emergency assistance."
              }
            />
          </p>
        </>
      )}
    </article>
  );
}
