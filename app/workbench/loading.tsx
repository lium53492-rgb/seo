export default function WorkbenchLoading() {
  return (
    <main className="wb-recovery" aria-busy="true" aria-live="polite">
      <p className="wb-kicker">LOADING VERIFIED DATA</p>
      <h1>正在核验最新报告…</h1>
      <p>工作台只会显示通过结构校验的数据。</p>
      <span className="wb-loading-bar" aria-hidden="true" />
    </main>
  );
}
