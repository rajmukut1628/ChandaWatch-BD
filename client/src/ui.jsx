import React, { createContext, useContext } from "react";
import { translate } from "./staff-copy";
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
  Play,
} from "lucide-react";
export const Context = createContext();
export const useApp = () => useContext(Context);
export function Text({ value }) {
  const { bn } = useApp();
  return translate(value, bn);
}
export const Icon = {
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
  Play,
};
export function Alert({ children, error = false }) {
  return (
    <div
      className={"notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      <TriangleAlert size={18} />
      <span>
        {typeof children === "string" ? <Text value={children} /> : children}
      </span>
    </div>
  );
}
export function PageTitle({ eyebrow, title, children }) {
  return (
    <div className="page-title">
      <span className="eyebrow">
        {typeof eyebrow === "string" ? <Text value={eyebrow} /> : eyebrow}
      </span>
      <h1>{typeof title === "string" ? <Text value={title} /> : title}</h1>
      <p>
        {typeof children === "string" ? <Text value={children} /> : children}
      </p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" /> <Text value="Loading…" />
    </div>
  );
}
export function Empty({ children = "No records to display yet." }) {
  return (
    <div className="empty">
      <FileText size={30} />
      <p>
        {typeof children === "string" ? <Text value={children} /> : children}
      </p>
    </div>
  );
}
