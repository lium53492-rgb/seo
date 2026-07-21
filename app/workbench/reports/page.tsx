import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isBasicAuthHeaderAuthorized } from "@/lib/seo/auth";
import { readReportHistory } from "@/lib/seo/report-store";
import type { DailySeoReport } from "@/lib/seo/types";
import { PrintReportButton } from "./PrintReportButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO 日报归档 | Growth OS",
  robots: { index: false, follow: false },
};

function publicationsFor(report: DailySeoReport) {
  return report.publications?.length ? report.publications : report.publication ? [report.publication] : [];
}

export default async function WorkbenchReportsPage() {
  const requestHeaders = await headers();
  if (process.env.WORKBENCH_PASSWORD && !isBasicAuthHeaderAuthorized(requestHeaders.get("authorization"))) {
    notFound();
  }

  const reports = (await readReportHistory(90)).slice().reverse();

  return (
    <main className="wb-shell">
      <aside className="wb-sidebar">
        <a className="wb-brand" href="/workbench" aria-label="返回 SEO Growth OS">
          <span className="wb-brand-mark">N</span>
          <span><strong>Growth OS</strong><small>NovelAI SEO</small></span>
        </a>
        <nav className="wb-nav" aria-label="日报归档导航">
          <a href="/workbench"><span>←</span>返回工作台</a>
          <a className="active" href="/workbench/reports"><span>▤</span>日报归档</a>
          <a href="/workbench/guide"><span>?</span>使用指南</a>
        </nav>
        <div className="wb-sidebar-note"><span className="wb-dot partial" /><p><strong>{reports.length} 份日报</strong><small>研究、内容、质量与真实数据</small></p></div>
      </aside>
      <div className="wb-main wb-reports">
        <header className="wb-topbar">
          <div><p className="wb-kicker">DAILY REPORT ARCHIVE</p><h1>集中查看每一次 SEO 生产。</h1></div>
          <div className="wb-top-actions"><a className="wb-guide-link" href="/workbench">返回今日工作台</a><PrintReportButton /></div>
        </header>
        <p className="wb-report-intro">每张日报保留当日机会、公开证据、发布页、质量闸门和已读取的 Search Console 指标。这里展示仓库中可追溯的日报；“打印 / 存为 PDF”可把当前归档保存为日报附件。</p>
        {reports.length ? <div className="wb-report-archive">{reports.map((report) => {
          const top = report.opportunities[0];
          const publications = publicationsFor(report);
          return <article className="wb-report-card" id={`report-${report.date}`} key={report.id}>
            <div className="wb-report-card-head"><div><p className="wb-kicker">{report.date}</p><h2>{top?.keyword ?? "No publishable opportunity"}</h2></div><span className={`wb-mode-badge ${report.mode}`}>{report.mode.toUpperCase()}</span></div>
            <dl className="wb-report-metrics"><div><dt>机会分</dt><dd>{top?.score ?? "—"}</dd></div><div><dt>已发布</dt><dd>{publications.filter((item) => item.status === "published").length}</dd></div><div><dt>真实点击</dt><dd>{report.summary.totalClicks}</dd></div><div><dt>真实曝光</dt><dd>{report.summary.totalImpressions}</dd></div></dl>
            <p>{top?.reason ?? "该日报没有通过发布闸门的机会。"}</p>
            <div className="wb-report-links">
              {publications.filter((item) => item.path).map((item) => <a key={item.path} href={item.path}>{item.slot === "afternoon" ? "下午页面" : "上午页面"}</a>)}
              <a href={`https://github.com/lium53492-rgb/seo/blob/main/data/reports/${report.date}.json`} target="_blank" rel="noreferrer">查看原始日报</a>
            </div>
          </article>;
        })}</div> : <div className="wb-empty-state">还没有可归档的日报。首次通过研究和质量闸门后，日报会自动显示在这里。</div>}
      </div>
    </main>
  );
}
