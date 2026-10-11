import { translate } from "./staff-copy";
import React, { useState, useEffect, createContext, useContext } from "react";
import {
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  LockKeyhole,
  MapPin,
  FileText,
  Search,
  ChartNoAxesCombined,
  Menu,
  X,
  Globe,
  ChevronRight,
  Check,
  Users,
  LogOut,
  LayoutDashboard,
  ClipboardList,
  ScrollText,
  HeartHandshake,
  Phone,
  TriangleAlert,
  Shield,
  EyeOff,
  Clock,
  Download,
  Upload,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { api, setCsrf, typeLabels, baseTypeLabels, statusLabels } from "./api";
import { PublicInformation } from "./PublicInformation";
import {
  ThemeToggle,
  ManagedPublicContent,
  HomeSections,
} from "./FeaturePublic";
import { NotificationLink } from "./FeatureStaff";
import { NewsHome, NewsDetail } from "./News";
import { setTranslationLanguage } from "./staff-copy";
import {
  ReportPage,
  SuccessPage,
  TrackPage,
  PrivacyRequestPage,
} from "./Reporter";
const lazyNamed = (load, name) =>
  React.lazy(() =>
    load().then((module) => ({
      default: module[name],
    })),
  );
const NotificationsPage = lazyNamed(
  () => import("./FeatureStaff"),
  "NotificationsPage",
);
const AccountPage = lazyNamed(() => import("./FeatureStaff"), "AccountPage");
const RecoveryPage = lazyNamed(() => import("./FeatureStaff"), "RecoveryPage");
const WorkloadPage = lazyNamed(() => import("./FeatureStaff"), "WorkloadPage");
const PriorityQueue = lazyNamed(
  () => import("./FeatureStaff"),
  "PriorityQueue",
);
const ContentManager = lazyNamed(
  () => import("./FeatureAdmin"),
  "ContentManager",
);
const AccessManager = lazyNamed(
  () => import("./FeatureAdmin"),
  "AccessManager",
);
const FeedbackQueue = lazyNamed(
  () => import("./FeatureAdmin"),
  "FeedbackQueue",
);
const OperationsPage = lazyNamed(
  () => import("./FeatureAdmin"),
  "OperationsPage",
);
const SettingsPage = lazyNamed(() => import("./FeatureAdmin"), "SettingsPage");
const BookmarksPage = lazyNamed(
  () => import("./FeaturePublic"),
  "BookmarksPage",
);
const PublicSummary = lazyNamed(
  () => import("./FeaturePublic"),
  "PublicSummary",
);
const AdminNewReport = lazyNamed(
  () => import("./AdminTools"),
  "AdminNewReport",
);
const AdminPageInfo = lazyNamed(() => import("./PageInfo"), "AdminPageInfo");
const PublicCases = lazyNamed(() => import("./PublicCases"), "PublicCases");
const PublicCaseDetail = lazyNamed(
  () => import("./PublicCases"),
  "PublicCaseDetail",
);
const Statistics = lazyNamed(() => import("./Statistics"), "Statistics");
const MapPage = lazyNamed(() => import("./Statistics"), "MapPage");
const StaffLogin = lazyNamed(() => import("./Staff"), "StaffLogin");
const Dashboard = lazyNamed(() => import("./Staff"), "Dashboard");
const Queue = lazyNamed(() => import("./Staff"), "Queue");
const ReportReview = lazyNamed(() => import("./Staff"), "ReportReview");
const StaffUsers = lazyNamed(() => import("./Staff"), "StaffUsers");
const AuditLogs = lazyNamed(() => import("./Staff"), "AuditLogs");
const PrivacyQueue = lazyNamed(() => import("./Staff"), "PrivacyQueue");
import {
  Context,
  useApp,
  Icon,
  Text,
  Alert,
  PageTitle,
  Loading,
  Empty,
} from "./ui";
function Guard({ admin = false, children }) {
  const { user, authLoading } = useApp();
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (admin && user.role !== "super_admin")
    return (
      <Alert error>
        <Text value={"Administrator access required."} />
      </Alert>
    );
  return children;
}
export function Shell({ children }) {
  const { bn, setBn, user, setUser } = useApp(),
    [menu, setMenu] = useState(false),
    location = useLocation();
  const staff =
    (location.pathname.startsWith("/staff/") &&
      location.pathname !== "/staff/login") ||
    location.pathname.startsWith("/admin/");
  const panel = staff && Boolean(user);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const t = (b, e) => translate(bn ? b : e);
  return (
    <>
      <a className="skip-link" href="#main-content">
        <Text value={bn ? "মূল বিষয়ে যান" : "Skip to content"} />
      </a>
      {!panel && (
        <>
          <div className="topbar">
            <div className="container">
              <span>
                <span className="live-dot" />{" "}
                {t(
                  "একটি স্বাধীন নাগরিক সচেতনতা উদ্যোগ",
                  "An independent community safety initiative",
                )}
              </span>
              <Link to="/safety">
                {t("জরুরি সহায়তা", "Emergency resources")}{" "}
                <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>
          <header>
            <div className="container header-inner">
              <Link className="brand" to="/">
                <span className="brand-mark">
                  <ShieldCheck size={25} />
                </span>
                <span>
                  {" "}
                  <Text value={"ChandaWatch"} />
                  <span className="bd">
                    <Text value={"BD"} />
                  </span>
                  <small>
                    {t("নিরাপদ বাংলাদেশের পাশে", "FOR A SAFER BANGLADESH")}
                  </small>
                </span>
              </Link>
              <button
                className="icon-button mobile-menu"
                aria-label={translate("Toggle navigation")}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <Menu />}
              </button>
              <nav className={menu ? "open" : ""}>
                <NavLink to="/" end>
                  {t("হোম", "Home")}
                </NavLink>
                <NavLink to="/news">{t("সংবাদ", "News")}</NavLink>
                <NavLink to="/about">{t("পরিচিতি", "About")}</NavLink>
                <NavLink to="/incidents">
                  {t("ঘটনার চিত্র", "Public view")}
                </NavLink>
                <NavLink to="/statistics">
                  {t("পরিসংখ্যান", "Statistics")}
                </NavLink>
                <NavLink to="/map">{t("ম্যাপ", "Incident map")}</NavLink>
                <NavLink to="/awareness">{t("সচেতনতা", "Awareness")}</NavLink>
                <NavLink to="/track">
                  {t("ট্র্যাক করুন", "Track report")}
                </NavLink>
              </nav>
              <div className="header-actions">
                <button className="lang" onClick={() => setBn(!bn)}>
                  <Globe size={15} />
                  <Text value={bn ? "EN" : "বাংলা"} />
                </button>
                {location.pathname !== "/" && (
                  <Link className="button small" to="/report">
                    {t("ঘটনা জানান", "Report an incident")}
                    <ArrowUpRight size={16} />
                  </Link>
                )}
              </div>
            </div>
          </header>
        </>
      )}
      {panel && (
        <header className="panel-header">
          <div className="container panel-header-inner">
            <Link
              className="brand"
              to={
                user.role === "super_admin"
                  ? "/admin/dashboard"
                  : "/staff/dashboard"
              }
            >
              <ShieldCheck size={25} />
              <span>
                {" "}
                <Text value={"ChandaWatch"} />{" "}
                <span className="bd">
                  <Text value={"BD"} />
                </span>
                <small>
                  {user.role === "super_admin"
                    ? t("প্রশাসক প্যানেল", "Administrator panel")
                    : t("স্টাফ প্যানেল", "Staff panel")}
                </small>
              </span>
            </Link>
            <div className="panel-header-actions">
              <Link to="/">{t("পাবলিক সাইট দেখুন", "View public site")}</Link>
              <ThemeToggle />
              <button className="lang" onClick={() => setBn(!bn)}>
                <Globe size={15} />
                <Text value={bn ? "EN" : "বাংলা"} />
              </button>
              <NotificationLink />
            </div>
          </div>
        </header>
      )}
      {panel ? (
        <div className="staff-layout container">
          <aside className="staff-nav">
            <span className="eyebrow">
              <Text value={"WORKSPACE"} />
            </span>
            <NavLink
              to={
                user.role === "super_admin"
                  ? "/admin/dashboard"
                  : "/staff/dashboard"
              }
            >
              <LayoutDashboard size={18} /> <Text value={"Dashboard"} />{" "}
            </NavLink>
            <NavLink to="/staff/reports">
              <ClipboardList size={18} /> <Text value={"Reports"} />{" "}
            </NavLink>
            <NavLink to="/staff/analytics">
              <ChartNoAxesCombined size={18} />{" "}
              <Text value={"Analytics"} />{" "}
            </NavLink>
            {user.role === "super_admin" && (
              <>
                <NavLink to="/admin/reports/new">
                  <FileText size={18} /> <Text value={"Add report"} />{" "}
                </NavLink>
                <NavLink to="/admin/page-info">
                  <ScrollText size={18} />{" "}
                  <Text value={"Public information"} />{" "}
                </NavLink>
                <NavLink to="/admin/users">
                  <Users size={18} /> <Text value={"Staff members"} />{" "}
                </NavLink>
                <NavLink to="/admin/audit-logs">
                  <ScrollText size={18} /> <Text value={"Audit logs"} />{" "}
                </NavLink>
                <NavLink to="/admin/privacy-requests">
                  <Shield size={18} /> <Text value={"Privacy requests"} />{" "}
                </NavLink>
              </>
            )}
            <NavLink to="/staff/notifications">
              <Text value="Notifications" />
            </NavLink>
            <NavLink to="/staff/priority">
              <Text value="Priority queue" />
            </NavLink>
            <NavLink to="/staff/workload">
              <Text value="Staff workload" />
            </NavLink>
            <NavLink to="/staff/account">
              <Text value="Account and sessions" />
            </NavLink>
            {user.role === "super_admin" && (
              <>
                <NavLink to="/admin/content">
                  <Text value="News and content" />
                </NavLink>
                <NavLink to="/admin/access">
                  <Text value="Staff access" />
                </NavLink>
                <NavLink to="/admin/feedback">
                  <Text value="Public feedback" />
                </NavLink>
                <NavLink to="/admin/operations">
                  <Text value="Operations" />
                </NavLink>
                <NavLink to="/admin/settings">
                  <Text value="System settings" />
                </NavLink>
              </>
            )}
            <div className="staff-profile">
              <strong>{user.name}</strong>
              <small>
                <Text value={user.role.replaceAll("_", " ")} />
              </small>
              <button
                onClick={async () => {
                  try {
                    await api("/staff/auth/logout", {
                      method: "POST",
                    });
                    setCsrf("");
                    setUser(null);
                  } catch (e) {
                    window.alert(e.message);
                  }
                }}
              >
                <LogOut size={16} /> <Text value={"Sign out"} />{" "}
              </button>
            </div>
          </aside>
          <main id="main-content" tabIndex={-1} className="staff-main">
            {children}
          </main>
        </div>
      ) : (
        <main id="main-content" tabIndex={-1}>
          {children}
          {["/about", "/awareness", "/safety", "/privacy"].includes(
            location.pathname,
          ) && (
            <ManagedPublicContent
              page={
                location.pathname === "/about"
                  ? "home"
                  : location.pathname.slice(1)
              }
            />
          )}
        </main>
      )}
      {!panel && (
        <>
          <div className="utility-bar container no-print">
            <ThemeToggle />
            <Link to="/bookmarks">
              <Text value={bn ? "বুকমার্ক" : "Bookmarks"} />
            </Link>
            <Link to="/summary">
              <Text value={bn ? "মাসিক সারসংক্ষেপ" : "Monthly summary"} />
            </Link>
            <Link to="/faq">
              <Text value={bn ? "প্রশ্ন–উত্তর" : "FAQ"} />
            </Link>
            <NotificationLink />
          </div>
          <footer>
            <div className="container footer-grid">
              <div>
                <Link className="brand" to="/">
                  <ShieldCheck size={28} /> <Text value={"ChandaWatch"} />
                  <span className="bd">
                    <Text value={"BD"} />
                  </span>
                </Link>
                <p>
                  {t(
                    "তথ্য দিয়ে সচেতনতা। গোপনীয়তার প্রতি সম্মান। নিরাপদ বাংলাদেশের জন্য একসাথে।",
                    "Awareness through information. Respect for privacy. Together for a safer Bangladesh.",
                  )}
                </p>
                <small>
                  <Text value={"Independent platform \xB7 Controlled pilot"} />
                </small>
              </div>
              <div>
                <strong>{t("প্ল্যাটফর্ম", "Platform")}</strong>
                {location.pathname !== "/" && (
                  <Link to="/report">
                    <Text value="Report an incident" />
                  </Link>
                )}
                <Link to="/news">{t("সব সংবাদ", "All news")}</Link>
                <Link to="/about">
                  {t("প্ল্যাটফর্ম পরিচিতি", "About the platform")}
                </Link>
                <Link to="/track">
                  <Text value="Track your report" />
                </Link>
                <Link to="/incidents">{t("ঘটনার চিত্র", "Public view")}</Link>
                <Link to="/statistics">
                  <Text value="Public statistics" />
                </Link>
              </div>
              <div>
                <strong>{t("সহায়তা", "Resources")}</strong>
                <Link to="/safety">
                  <Text value="Safety & emergency" />
                </Link>
                <Link to="/privacy">
                  <Text value="Privacy policy" />
                </Link>
                <Link to="/report-content">
                  <Text value="Correction & removal" />
                </Link>
              </div>
              <div className="footer-note">
                <Shield size={24} />
                <p>
                  <Text value="This is an independent reporting platform. It is not a police service or an emergency response channel." />
                </p>
                <Link to="/staff/login">
                  <Text value="Staff sign in" />
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
            <div className="container footer-bottom">
              <span>
                © {new Date().getFullYear()} <Text value={"ChandaWatch BD"} />
              </span>
              <span>
                {" "}
                <Text value={"Made for our communities"} />{" "}
                <span className="red-dot">●</span>{" "}
                <Text value={"Bangladesh"} />{" "}
              </span>
            </div>
          </footer>
        </>
      )}
    </>
  );
}
function AboutPlatform() {
  const { bn } = useApp(),
    t = (b, e) => translate(bn ? b : e);
  return (
    <HomeSections>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" />
              {t(
                "আপনার কণ্ঠ গুরুত্বপূর্ণ",
                "YOUR VOICE. OUR COLLECTIVE SAFETY.",
              )}
            </span>
            <h1>
              {t("নীরবতা নয়,", "A safer Bangladesh")}
              <br />
              <span>{t("সচেতনতাই শক্তি।", "starts with a voice.")}</span>
            </h1>
            <p>
              {t(
                "চাঁদাবাজির ঘটনা নিরাপদে জানান। পরিচয় গোপন রেখে অভিযোগের অগ্রগতি দেখুন এবং যাচাইকৃত তথ্য দিয়ে আপনার এলাকাকে সচেতন করুন।",
                "Report extortion incidents with care. Track your report privately, and help your community understand the patterns that matter.",
              )}
            </p>
            <div className="hero-buttons">
              <Link to="/report" className="button">
                {t("একটি ঘটনা জানান", "Report an incident")}
                <ArrowUpRight size={18} />
              </Link>
              <Link to="/track" className="button outline">
                <Search size={17} />
                {t("রিপোর্ট ট্র্যাক করুন", "Track a report")}
              </Link>
            </div>
            <div className="trust-line">
              <span>
                <LockKeyhole size={14} />
                {t("পরিচয় দেওয়া ঐচ্ছিক", "No account required")}
              </span>
              <span>
                <EyeOff size={14} />
                {t("প্রমাণ ব্যক্তিগত থাকে", "Private evidence")}
              </span>
              <span>
                <ShieldCheck size={14} />
                {t("মানবিক পর্যালোচনা", "Human review")}
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-top">
              <span>
                <span className="live-dot" />{" "}
                <Text value={"COMMUNITY WATCH"} />{" "}
              </span>
              <span>
                <Text value={"BD / 08 DIVISIONS"} />
              </span>
            </div>
            <div
              className="abstract-map"
              aria-label={translate("Decorative Bangladesh illustration")}
            >
              <svg viewBox="0 0 340 390">
                <defs>
                  <pattern
                    id="dots"
                    width="13"
                    height="13"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="3" cy="3" r="1.3" fill="#739589" />
                  </pattern>
                </defs>
                <path
                  d="M116 15L149 42 181 32 199 61 250 71 260 96 224 116 233 146 257 147 276 176 252 210 260 245 282 271 298 317 290 367 271 350 258 315 235 293 220 255 193 246 175 277 148 272 136 299 104 272 99 248 70 242 58 213 76 187 48 161 71 145 62 119 89 104 80 77 102 67 97 35Z"
                  fill="#d8e9db"
                  stroke="#a7c4af"
                  strokeWidth="1.5"
                />
                <path
                  d="M116 15L149 42 181 32 199 61 250 71 260 96 224 116 233 146 257 147 276 176 252 210 260 245 282 271 298 317 290 367 271 350 258 315 235 293 220 255 193 246 175 277 148 272 136 299 104 272 99 248 70 242 58 213 76 187 48 161 71 145 62 119 89 104 80 77 102 67 97 35Z"
                  fill="url(#dots)"
                />
                {[
                  [126, 69],
                  [170, 151],
                  [150, 197],
                  [226, 263],
                  [112, 228],
                  [224, 107],
                ].map(([x, y], i) => (
                  <g key={i}>
                    <circle cx={x} cy={y} r="13" fill="#1d6654" opacity=".12" />
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill="#27664e"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  </g>
                ))}
              </svg>
              <span className="map-label dhaka">
                {" "}
                <Text value={"Dhaka"} /> <span>●</span>
              </span>
              <span className="map-label ctg">
                {" "}
                <Text value={"Chattogram"} /> <span>●</span>
              </span>
              <div className="map-card">
                <ShieldCheck size={24} />
                <div>
                  <strong>
                    {t("গোপনীয়তা সবার আগে", "Privacy comes first")}
                  </strong>
                  <span>
                    {t(
                      "এলাকা অনুযায়ী তথ্য, পরিচয় নয়",
                      "District insights. Protected identities.",
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="visual-bottom">
              <span>
                <span className="red-dot">●</span>{" "}
                <Text value={"BANGLADESH"} />{" "}
              </span>
              <Link to="/map">
                <Text value="Explore the map" />
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <span className="visual-caption">
              {" "}
              <Text
                value={"Illustration \xB7 not live incident locations"}
              />{" "}
            </span>
          </div>
        </div>
      </section>
      <section className="facts container">
        <div>
          <strong>64</strong>
          <span>{t("জেলা, একটি বাংলাদেশ", "Districts, one Bangladesh")}</span>
        </div>
        <div>
          <strong>08</strong>
          <span>{t("বিভাগের তথ্য", "Divisions connected")}</span>
        </div>
        <div>
          <LockKeyhole />
          <strong>{t("ব্যক্তিগত", "Private")}</strong>
          <span>{t("পরিচয় ও প্রমাণ", "Identity & evidence")}</span>
        </div>
        <div>
          <Users />
          <strong>{t("মানবিক", "Human")}</strong>
          <span>{t("স্বাধীন পর্যালোচনা", "Independent review")}</span>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {t(
                "আপনার হাতেই প্রথম পদক্ষেপ",
                "A SMALL STEP. A MEANINGFUL DIFFERENCE.",
              )}
            </span>
            <h2>
              {t("কীভাবে কাজ করে", "From your voice to community awareness")}
            </h2>
          </div>
          <p>
            {t(
              "নিরাপত্তা এবং গোপনীয়তা মাথায় রেখে তৈরি প্রতিটি ধাপ।",
              "Every step is designed with care, privacy, and responsible review in mind.",
            )}
          </p>
        </div>
        <div className="steps">
          {[
            [
              FileText,
              "01",
              t("ঘটনা জানান", "Tell us what happened"),
              t(
                "ঘটনার বিবরণ, জেলা ও তারিখ দিন। নিজের পরিচয় দেওয়া বাধ্যতামূলক নয়।",
                "Share the incident, district, and date. You decide whether to leave contact information.",
              ),
            ],
            [
              LockKeyhole,
              "02",
              t("ব্যক্তিগতভাবে ট্র্যাক করুন", "Keep your access code"),
              t(
                "Tracking ID ও secret code সংরক্ষণ করুন। এ দুটো দিয়েই অগ্রগতি দেখবেন।",
                "Save your tracking ID and secret code. Use both to follow your report privately.",
              ),
            ],
            [
              ShieldCheck,
              "03",
              t("পর্যালোচনা ও সচেতনতা", "Review before awareness"),
              t(
                "স্বাধীন পর্যালোচনার পর শুধু পরিচয়বিহীন পরিসংখ্যান যুক্ত হয়।",
                "Independent reviewers assess reports before anonymized counts enter public statistics.",
              ),
            ],
          ].map(([I, n, title, desc]) => (
            <article className="step-card" key={n}>
              <div className="step-top">
                <span className="soft-icon">
                  <I size={24} />
                </span>
                <span>{n}</span>
              </div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="awareness-strip">
        <div className="container strip-grid">
          <div>
            <span className="eyebrow">
              {" "}
              <Text value={"INFORMATION IS A FIRST LINE OF DEFENSE"} />{" "}
            </span>
            <h2>
              {t("সচেতন থাকুন। নিরাপদ থাকুন।", "Stay informed. Stay safer.")}
            </h2>
            <p>
              {t(
                "ঝুঁকি কমানো, প্রমাণ সংরক্ষণ এবং সাহায্য চাওয়ার ব্যবহারিক তথ্য জানুন।",
                "Practical resources for documenting incidents, protecting your privacy, and finding help.",
              )}
            </p>
            <Link to="/awareness" className="text-link">
              {t("সচেতনতা কেন্দ্র দেখুন", "Visit the awareness center")}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="resource-preview">
            <span className="soft-icon">
              <HeartHandshake />
            </span>
            <div>
              <span className="eyebrow">
                <Text value={"SAFETY RESOURCE"} />
              </span>
              <h3>{t("তাৎক্ষণিক বিপদে?", "Facing immediate danger?")}</h3>
              <p>
                {t(
                  "জরুরি সহায়তার জন্য ৯৯৯। এই প্ল্যাটফর্ম জরুরি সেবা নয়।",
                  "Call 999 for emergency assistance. This platform does not dispatch emergency services.",
                )}
              </p>
              <Link to="/safety">
                <Text value="View emergency resources" />
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="bottom-cta">
          <div>
            <h2>
              {t("আপনার অভিজ্ঞতা গুরুত্বপূর্ণ।", "Your experience matters.")}
            </h2>
            <p>
              {t(
                "একটি রিপোর্ট সচেতনতার শুরু হতে পারে।",
                "One report can be a first step toward greater awareness.",
              )}
            </p>
          </div>
          <Link to="/report" className="button">
            {t("ঘটনা জানান", "Report an incident")}
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </HomeSections>
  );
}
function Resources({ kind }) {
  const { bn } = useApp();
  if (kind === "privacy")
    return (
      <div className="container narrow section">
        <PageTitle
          eyebrow={translate("YOUR INFORMATION, HANDLED WITH CARE")}
          title={translate(bn ? "গোপনীয়তা নীতি" : "Privacy policy")}
        >
          {" "}
          <Text
            value={"Effective October 10, 2026 \xB7 Controlled pilot"}
          />{" "}
        </PageTitle>
        <div className="prose card">
          <h2>
            <Text value="What we collect" />
          </h2>
          <p>
            <Text value="Incident type, district, date, area, description and optional amount or contact details. No reporter account is required. Evidence is optional and privately stored." />
          </p>
          <h2>
            <Text value="How information is protected" />
          </h2>
          <p>
            <Text value="Sensitive fields and evidence are encrypted. Tracking requires both a random ID and a secret access code. Staff use email and password; access is limited by role and assignment. Reading private records creates an audit event." />
          </p>
          <h2>
            <Text value="Anonymous does not mean untraceable" />
          </h2>
          <p>
            <Text value="Hosting providers and networks may retain metadata. Uploaded files can contain identifying metadata, faces, voices or document properties. Remove identifying information from files before uploading when safe. We do not promise complete anonymity." />
          </p>
          <h2>
            <Text value="Publication and retention" />
          </h2>
          <p>
            <Text value="Individual reports and evidence are not publicly published. Only approved aggregates are displayed, with small groups withheld. Default report retention is 180 days. Backups may retain deleted data until the backup retention window expires. Operators must configure and verify their deletion schedule." />
          </p>
          <h2>
            <Text value="Your choices" />
          </h2>
          <p>
            <Text value="Do not include unnecessary names, identity numbers or exact home addresses. Optional contact information is available only to senior staff. Keep your tracking secret offline; lost secrets cannot be recovered." />
          </p>
          <Link className="button outline" to="/report-content">
            <Text value="Request correction, access or removal" />
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  const safety = kind === "safety";
  const articles = safety
    ? [
        [
          "Immediate danger",
          "Move to a safer place when possible. For urgent police, fire or ambulance assistance in Bangladesh, contact national emergency service 999. Do not rely on this platform for emergency response.",
        ],
        [
          "Choose a safe way to report",
          "Consider who can access your device or messages. Use a trusted device when possible. Save your access code somewhere others cannot see it.",
        ],
        [
          "Get appropriate support",
          "If you choose to contact authorities, use the official Bangladesh Police website to locate services. Consider a trusted person who can help you seek support.",
        ],
      ]
    : [
        [
          "Document what you remember",
          "Write down the date, general area, what was demanded and what happened. Distinguish direct observations from information heard from others. Do not put yourself at risk to collect evidence.",
        ],
        [
          "Protect identifying information",
          "Before uploading, check images and documents for faces, phone numbers, address details and location metadata. Evidence remains private, but metadata can still reveal identity to authorized reviewers.",
        ],
        [
          "Understand the review process",
          "A submitted report is an allegation. Moderation, evidence review and independent verification are different processes. Report counts are not a measure of actual crime rates.",
        ],
        [
          "Avoid public accusations",
          "Use the private reporting channel. Do not post identifying allegations about individuals in public. Senior review checks redaction before aggregate publication.",
        ],
      ];
  return (
    <div className="container section">
      <PageTitle
        eyebrow={translate(
          safety ? "HELP & EMERGENCY" : "KNOWLEDGE FOR OUR COMMUNITIES",
        )}
        title={translate(
          safety
            ? bn
              ? "নিরাপত্তা ও জরুরি সহায়তা"
              : "Safety & emergency resources"
            : bn
              ? "সচেতনতা কেন্দ্র"
              : "Awareness center",
        )}
      >
        <Text
          value={
            safety
              ? "Practical support when you need it."
              : "Know your options. Document responsibly. Protect your privacy."
          }
        />
      </PageTitle>
      {safety && (
        <div className="emergency-card">
          <Phone size={34} />
          <div>
            <h2>
              <Text value="999 \xB7 National emergency service" />
            </h2>
            <p>
              <Text value="For urgent emergency assistance in Bangladesh." />
            </p>
            <a className="button" href="tel:999">
              <Text value="Call 999" />
              <Phone size={16} />
            </a>
          </div>
        </div>
      )}
      <div className="resource-grid">
        {articles.map(([title, desc], i) => (
          <article className="card" key={title}>
            <span className="eyebrow">
              {String(i + 1).padStart(2, "0")} /{" "}
              <Text value={safety ? "SAFETY" : "AWARENESS"} />
            </span>
            <h2>
              <Text value={title} />
            </h2>
            <p>
              <Text value={desc} />
            </p>
          </article>
        ))}
      </div>
      {safety && (
        <p className="source-line">
          <Text value="Official resources:" />
          <a href="https://www.police.gov.bd/" target="_blank" rel="noreferrer">
            {" "}
            <Text value={"Bangladesh Police"} /> <ArrowUpRight size={12} />
          </a>{" "}
          ·{" "}
          <a
            href="https://www.police.gov.bd/storage/upload/announcement/EQn6xVWGC2SEEKpOeUKlcWEOTtqc8RCjxdWvLiP6.pdf"
            target="_blank"
            rel="noreferrer"
          >
            {" "}
            <Text value={"National Emergency Service 999"} />{" "}
          </a>
        </p>
      )}
      <Alert>
        <Text value="Report intake, moderator review, and independent verification are separate. This platform does not guarantee a particular outcome." />
      </Alert>
    </div>
  );
}
class Boundary extends React.Component {
  state = {
    error: false,
  };
  static getDerivedStateFromError() {
    return {
      error: true,
    };
  }
  componentDidCatch() {
    api("/features/public/errors", {
      method: "POST",
      body: {
        code: "render_error",
        page:
          location.pathname.startsWith("/staff") ||
          location.pathname.startsWith("/admin")
            ? "staff"
            : "public",
      },
    }).catch(() => {});
  }
  render() {
    return this.state.error ? (
      <div className="container section">
        <Alert error>
          {" "}
          <Text
            value={"The page could not be displayed. Reload to try again."}
          />{" "}
        </Alert>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [bn, setBn] = useState(
      () => localStorage.getItem("cw_language") !== "en",
    ),
    [user, setUser] = useState(null),
    [receipt, setReceipt] = useState(null),
    [authLoading, setAuthLoading] = useState(true),
    [districts, setDistricts] = useState([]),
    [upazilas, setUpazilas] = useState([]),
    [unions, setUnions] = useState([]),
    [categories, setCategories] = useState([]);
  setTranslationLanguage(bn);
  useEffect(() => {
    const refreshCategories = () =>
      api("/features/public/categories")
        .then((d) => {
          for (const key of Object.keys(typeLabels)) delete typeLabels[key];
          Object.assign(typeLabels, baseTypeLabels);
          setCategories(d.items);
          for (const c of d.items)
            typeLabels[c.slug] = [
              c.titleBn || typeLabels[c.slug]?.[0] || "ধরনের বাংলা নাম প্রয়োজন",
              c.title,
            ];
        })
        .catch(() => {});
    refreshCategories();
    window.addEventListener("cw-content-updated", refreshCategories);
    api("/public/districts")
      .then((d) => setDistricts(d.districts))
      .catch(() => {});
    api("/public/upazilas")
      .then((d) => setUpazilas(d.upazilas))
      .catch(() => {});
    api("/public/unions")
      .then((d) => setUnions(d.unions))
      .catch(() => {});
    api("/staff/auth/me")
      .then((d) => {
        setUser(d.user);
        setCsrf(d.csrfToken);
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
    return () =>
      window.removeEventListener("cw-content-updated", refreshCategories);
  }, []);
  useEffect(() => {
    document.documentElement.lang = bn ? "bn" : "en";
    document.title = bn
      ? "চাঁদাওয়াচ বাংলাদেশ — জনসচেতনতা ও সংবাদ"
      : "ChandaWatch BD — Community awareness and news";
    localStorage.setItem("cw_language", bn ? "bn" : "en");
  }, [bn]);
  return (
    <Context.Provider
      value={{
        bn,
        setBn,
        user,
        setUser,
        receipt,
        setReceipt,
        authLoading,
        districts,
        upazilas,
        unions,
        categories,
      }}
    >
      <Boundary>
        <Shell>
          <React.Suspense fallback={<Loading />}>
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <NewsHome />
                  </>
                }
              />
              <Route path="/report" element={<ReportPage />} />
              <Route
                path="/about"
                element={
                  <>
                    <AboutPlatform />
                    <PublicInformation slug="home" />
                  </>
                }
              />
              <Route path="/news" element={<NewsHome archive />} />
              <Route path="/news/:slug" element={<NewsDetail />} />
              <Route path="/report/success" element={<SuccessPage />} />
              <Route path="/track" element={<TrackPage />} />
              <Route path="/incidents" element={<PublicCases />} />
              <Route
                path="/incidents/:publicId"
                element={<PublicCaseDetail />}
              />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/map" element={<MapPage />} />
              <Route
                path="/awareness"
                element={
                  <>
                    <PublicInformation slug="awareness" />
                    <Resources kind="awareness" />
                  </>
                }
              />
              <Route
                path="/safety"
                element={
                  <>
                    <PublicInformation slug="safety" />
                    <Resources kind="safety" />
                  </>
                }
              />
              <Route
                path="/privacy"
                element={
                  <>
                    <PublicInformation slug="privacy" />
                    <Resources kind="privacy" />
                  </>
                }
              />
              <Route path="/report-content" element={<PrivacyRequestPage />} />
              <Route path="/staff/login" element={<StaffLogin />} />
              <Route path="/staff/recovery" element={<RecoveryPage />} />
              <Route path="/staff/verify" element={<RecoveryPage verify />} />
              <Route path="/bookmarks" element={<BookmarksPage />} />
              <Route path="/summary" element={<PublicSummary />} />
              <Route
                path="/faq"
                element={
                  <>
                    <div className="container section">
                      <PageTitle
                        title={translate(
                          bn ? "প্রশ্ন–উত্তর" : "Frequently asked questions",
                        )}
                      />
                    </div>
                    <ManagedPublicContent kind="faq" />
                  </>
                }
              />
              <Route
                path="/staff/notifications"
                element={
                  <Guard>
                    <NotificationsPage />
                  </Guard>
                }
              />
              <Route
                path="/staff/account"
                element={
                  <Guard>
                    <AccountPage />
                  </Guard>
                }
              />
              <Route
                path="/staff/workload"
                element={
                  <Guard>
                    <WorkloadPage />
                  </Guard>
                }
              />
              <Route
                path="/staff/priority"
                element={
                  <Guard>
                    <PriorityQueue />
                  </Guard>
                }
              />
              <Route
                path="/admin/content"
                element={
                  <Guard admin>
                    <ContentManager />
                  </Guard>
                }
              />
              <Route
                path="/admin/access"
                element={
                  <Guard admin>
                    <AccessManager />
                  </Guard>
                }
              />
              <Route
                path="/admin/feedback"
                element={
                  <Guard admin>
                    <FeedbackQueue />
                  </Guard>
                }
              />
              <Route
                path="/admin/operations"
                element={
                  <Guard admin>
                    <OperationsPage />
                  </Guard>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <Guard admin>
                    <SettingsPage />
                  </Guard>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <Guard admin>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route
                path="/admin/reports/new"
                element={
                  <Guard admin>
                    <AdminNewReport />
                  </Guard>
                }
              />
              <Route
                path="/staff/dashboard"
                element={
                  <Guard>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route
                path="/staff/reports"
                element={
                  <Guard>
                    <Queue />
                  </Guard>
                }
              />
              <Route
                path="/staff/reports/:id"
                element={
                  <Guard>
                    <ReportReview />
                  </Guard>
                }
              />
              <Route
                path="/staff/analytics"
                element={
                  <Guard>
                    <Statistics internal />
                  </Guard>
                }
              />
              <Route
                path="/admin/page-info"
                element={
                  <Guard admin>
                    <AdminPageInfo />
                  </Guard>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <Guard admin>
                    <StaffUsers />
                  </Guard>
                }
              />
              <Route
                path="/admin/audit-logs"
                element={
                  <Guard admin>
                    <AuditLogs />
                  </Guard>
                }
              />
              <Route
                path="/admin/privacy-requests"
                element={
                  <Guard admin>
                    <PrivacyQueue />
                  </Guard>
                }
              />
              <Route
                path="*"
                element={
                  <div className="container section">
                    <PageTitle title={translate("Page not found")}>
                      {" "}
                      <Text
                        value={"The page you requested does not exist."}
                      />{" "}
                    </PageTitle>
                    <Link className="button" to="/">
                      {" "}
                      <Text value={"Back to home"} />{" "}
                    </Link>
                  </div>
                }
              />
            </Routes>
          </React.Suspense>
        </Shell>
      </Boundary>
    </Context.Provider>
  );
}
