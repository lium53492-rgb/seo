import "./workbench.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "SEO Growth Workbench",
    template: "%s | SEO Growth Workbench",
  },
  description:
    "Internal workbench for verified SEO research, production reports, and content guidance.",
  robots: { index: false, follow: false },
};

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
