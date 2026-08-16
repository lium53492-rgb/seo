import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertPreservedProductMigrationHolds,
  validateProductMigrationHoldPolicy,
} from "../lib/seo/product-migration-hold.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(await readFile(join(projectRoot, "data", "config", "seo-policy.json"), "utf8"));
const heldSlug = policy.productMigrationHoldSlugs[0];
const heldPage = JSON.parse(await readFile(join(projectRoot, "data", "pages", `${heldSlug}.json`), "utf8"));

test("product migration holds stay bound to a grandfathered historical release", () => {
  const contract = validateProductMigrationHoldPolicy(policy);
  assert.deepEqual(contract.holdSlugs, [heldSlug]);
  assert.doesNotThrow(() => assertPreservedProductMigrationHolds(policy, [heldPage]));
});

test("product migration hold verification rejects deletion", () => {
  assert.throws(
    () => assertPreservedProductMigrationHolds(policy, []),
    /must retain exactly one historical page artifact/,
  );
});

test("product migration hold verification rejects content tampering", () => {
  const tampered = structuredClone(heldPage);
  tampered.h1 = "A changed product claim that was never reviewed";
  assert.throws(
    () => assertPreservedProductMigrationHolds(policy, [tampered]),
    /no longer matches its reviewed historical release identity and served-content digest/,
  );
});
