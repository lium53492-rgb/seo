import type { ProductFact } from "./types";
import productFactCatalog from "@/data/config/product-facts.json";

export const productFacts = productFactCatalog.facts satisfies ProductFact[];

export const productConstraints = productFactCatalog.constraints;
