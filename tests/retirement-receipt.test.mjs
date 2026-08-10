import assert from "node:assert/strict";
import test from "node:test";
import { assessPublicationRetirement } from "../lib/seo/retirement-receipt.mjs";

const digest = "a".repeat(64);
const date = "2026-08-10";
const slug = "retired-campaign-guide";
const report = {
  id: "seo-2026-08-10",
  date,
  publication: {
    status: "published",
    slug,
    publishedAt: "2026-08-10T03:06:48.328Z",
    draftDigest: digest,
  },
};
const review = {
  reportId: report.id,
  slug,
  decision: "approved",
  draftDigest: digest,
};
const receipt = {
  schemaVersion: 1,
  action: "retire_published_page",
  originalPublicationDate: date,
  slug,
  reportId: report.id,
  draftDigest: digest,
  publishedAt: report.publication.publishedAt,
  retiredAt: "2026-08-10T10:28:47.040Z",
};
const record = {
  schemaVersion: 1,
  authorization: "Direct user instruction recorded for this exact page retirement.",
  retiredPages: [slug],
  retiredPublications: [receipt],
};

test("an exact retirement receipt closes the published report lifecycle", () => {
  const result = assessPublicationRetirement({
    maintenanceRecords: [record],
    date,
    report,
    review,
  });

  assert.equal(result.state, "valid");
  assert.equal(result.slug, slug);
  assert.equal(result.retiredAt, receipt.retiredAt);
});

test("a receipt with a different draft digest is invalid", () => {
  const result = assessPublicationRetirement({
    maintenanceRecords: [{
      ...record,
      retiredPublications: [{ ...receipt, draftDigest: "b".repeat(64) }],
    }],
    date,
    report,
    review,
  });

  assert.equal(result.state, "invalid");
  assert.match(result.reason, /digest/i);
});

test("duplicate receipts fail closed", () => {
  const result = assessPublicationRetirement({
    maintenanceRecords: [record, record],
    date,
    report,
    review,
  });

  assert.equal(result.state, "invalid");
  assert.match(result.reason, /more than one/i);
});

test("a report without a matching receipt remains in its recorded lifecycle", () => {
  const result = assessPublicationRetirement({
    maintenanceRecords: [],
    date,
    report,
    review,
  });

  assert.equal(result.state, "none");
  assert.equal(result.slug, null);
});

test("every published item in a multi-publication legacy report needs an exact receipt", () => {
  const secondSlug = "second-retired-campaign-guide";
  const legacyReport = {
    id: "seo-2026-07-21",
    date: "2026-07-21",
    publication: {
      status: "published",
      slug,
      publishedAt: "2026-07-21T02:30:20.989Z",
    },
    publications: [
      {
        status: "published",
        slug,
        publishedAt: "2026-07-21T02:30:20.989Z",
      },
      {
        status: "published",
        slug: secondSlug,
        publishedAt: "2026-07-21T08:25:38.790Z",
      },
    ],
  };
  const legacyReceipts = legacyReport.publications.map((publication) => ({
    schemaVersion: 1,
    action: "retire_published_page",
    originalPublicationDate: legacyReport.date,
    slug: publication.slug,
    reportId: legacyReport.id,
    draftDigest: null,
    publishedAt: publication.publishedAt,
    retiredAt: "2026-08-10T10:28:47.040Z",
  }));
  const legacyRecord = {
    schemaVersion: 1,
    authorization: "Direct user instruction recorded for both exact legacy page retirements.",
    retiredPages: [slug, secondSlug],
    retiredPublications: legacyReceipts,
  };

  const complete = assessPublicationRetirement({
    maintenanceRecords: [legacyRecord],
    date: legacyReport.date,
    report: legacyReport,
    review: null,
  });
  assert.equal(complete.state, "valid");
  assert.deepEqual(complete.slugs, [slug, secondSlug]);
  assert.equal(complete.receipts.length, 2);

  const missingSecond = assessPublicationRetirement({
    maintenanceRecords: [{ ...legacyRecord, retiredPublications: [legacyReceipts[0]] }],
    date: legacyReport.date,
    report: legacyReport,
    review: null,
  });
  assert.equal(missingSecond.state, "invalid");
  assert.match(missingSecond.reason, /missing its retirement receipt/i);

  const changedTimestamp = assessPublicationRetirement({
    maintenanceRecords: [{
      ...legacyRecord,
      retiredPublications: [legacyReceipts[0], {
        ...legacyReceipts[1],
        publishedAt: "2026-07-21T09:25:38.790Z",
      }],
    }],
    date: legacyReport.date,
    report: legacyReport,
    review: null,
  });
  assert.equal(changedTimestamp.state, "invalid");
  assert.match(changedTimestamp.reason, /publication timestamp/i);
});
