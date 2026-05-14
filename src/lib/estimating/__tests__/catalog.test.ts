import { describe, expect, it } from "vitest";
import {
  addLineItemFromCatalogSchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
} from "../catalog-schemas";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe("createCatalogItemSchema", () => {
  it("parses a minimal payload", () => {
    const out = createCatalogItemSchema.parse({
      name: "Excavator hour",
      unit: "hr",
      default_price: "125.00",
    });
    expect(out).toMatchObject({
      name: "Excavator hour",
      unit: "hr",
      default_price: 12500,
      description: null,
      category: null,
    });
  });

  it("trims optional fields and converts blanks to null", () => {
    const out = createCatalogItemSchema.parse({
      name: "Concrete pour",
      description: "  ",
      unit: "yd3",
      default_price: "210",
      category: "",
    });
    expect(out.description).toBeNull();
    expect(out.category).toBeNull();
    expect(out.default_price).toBe(21000);
  });

  it("rejects negative or malformed money", () => {
    expect(() =>
      createCatalogItemSchema.parse({
        name: "x",
        unit: "ea",
        default_price: "-5",
      })
    ).toThrow();
    expect(() =>
      createCatalogItemSchema.parse({
        name: "x",
        unit: "ea",
        default_price: "1.234",
      })
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() =>
      createCatalogItemSchema.parse({
        name: "",
        unit: "ea",
        default_price: "10",
      })
    ).toThrow();
  });
});

describe("updateCatalogItemSchema", () => {
  it("requires a uuid catalog_item_id and parses is_active checkbox", () => {
    const out = updateCatalogItemSchema.parse({
      catalog_item_id: "00000000-0000-4000-8000-000000000001",
      name: "X",
      unit: "ea",
      default_price: "1.00",
      is_active: "on",
    });
    expect(out.is_active).toBe(true);
    expect(out.default_price).toBe(100);
  });

  it("treats missing checkbox as false (HTML form behavior)", () => {
    const out = updateCatalogItemSchema.parse({
      catalog_item_id: "00000000-0000-4000-8000-000000000001",
      name: "X",
      unit: "ea",
      default_price: "1.00",
    });
    expect(out.is_active).toBe(false);
  });
});

describe("addLineItemFromCatalogSchema", () => {
  it("accepts numeric or string quantities and validates uuids", () => {
    const out = addLineItemFromCatalogSchema.parse({
      estimate_id: "00000000-0000-4000-8000-000000000010",
      catalog_item_id: "00000000-0000-4000-8000-000000000020",
      quantity: "2.5",
    });
    expect(out.quantity).toBe("2.5");
  });

  it("rejects non-uuid identifiers", () => {
    expect(() =>
      addLineItemFromCatalogSchema.parse({
        estimate_id: "not-a-uuid",
        catalog_item_id: "00000000-0000-4000-8000-000000000020",
        quantity: "1",
      })
    ).toThrow();
  });

  it("works with FormData-style payloads", () => {
    const f = fd({
      estimate_id: "00000000-0000-4000-8000-000000000010",
      catalog_item_id: "00000000-0000-4000-8000-000000000020",
      quantity: "3",
    });
    const out = addLineItemFromCatalogSchema.parse({
      estimate_id: f.get("estimate_id"),
      catalog_item_id: f.get("catalog_item_id"),
      quantity: f.get("quantity"),
    });
    expect(out.quantity).toBe("3");
  });
});
