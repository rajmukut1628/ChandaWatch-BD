import { Text, useApp } from "./ui";
import React, { useEffect, useState } from "react";
import { api } from "./api";
export function PublicInformation({ slug }) {
  const { bn } = useApp();
  const [item, setItem] = useState(null);
  useEffect(() => {
    let alive = true;
    setItem(null);
    api("/public/page-info/" + slug)
      .then((d) => alive && setItem(d.item))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);
  if (!item) return null;
  return (
    <section className="container section">
      <div className="card public-information">
        <h2>
          {bn
            ? item.titleBn || "এই ভাষায় তথ্য এখনো প্রকাশিত হয়নি।"
            : item.title}
        </h2>
        {(bn
          ? item.bodyBn || "বাংলা তথ্য প্রকাশিত হলে এখানে দেখাবে।"
          : item.body
        )
          .split(/\n+/)
          .filter(Boolean)
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
      </div>
    </section>
  );
}
