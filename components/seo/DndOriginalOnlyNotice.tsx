import seoPolicy from "@/data/config/seo-policy.json";
import type { OriginalIpBoundary } from "@/lib/seo/types";
import styles from "./dnd-original-only-notice.module.css";

type DndOriginalOnlyNoticeProps = {
  ipBoundary?: OriginalIpBoundary;
};

export function DndOriginalOnlyNotice({ ipBoundary }: DndOriginalOnlyNoticeProps) {
  if (ipBoundary?.srdMaterialUsed !== false) return null;
  const notice = seoPolicy.ipBoundary.independenceNotice;

  return (
    <aside
      className={styles.notice}
      aria-label="D&D independence notice"
      data-ip-boundary="original-tabletop-fantasy"
      data-srd-material-used="false"
    >
      <strong>{notice.heading}</strong>
      <p>{notice.body}</p>
    </aside>
  );
}
