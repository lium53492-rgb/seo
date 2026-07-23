"use client";

import Link from "next/link";

export default function WorkbenchError({ reset }: { reset: () => void }) {
  return (
    <main className="wb-recovery" role="alert">
      <p className="wb-kicker">DATA RECOVERY</p>
      <h1>数据暂时没有读出来，页面本身仍然安全。</h1>
      <p>可能是远端报告、分析接口或网络短暂不可用。可以先重试；若持续失败，再检查工作台的数据连接状态。</p>
      <div>
        <button type="button" onClick={reset}>重新读取</button>
        <Link href="/workbench/guide">查看连接指南</Link>
      </div>
    </main>
  );
}
