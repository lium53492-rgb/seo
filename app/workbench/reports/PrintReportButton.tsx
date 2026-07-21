"use client";

export function PrintReportButton() {
  return (
    <button className="wb-primary-button" type="button" onClick={() => window.print()}>
      打印 / 存为 PDF
    </button>
  );
}
