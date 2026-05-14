import { describe, expect, it } from "vitest";
import { bucketForDaysOverdue } from "../overdue";

describe("bucketForDaysOverdue", () => {
  it("returns null for not-yet-overdue", () => {
    expect(bucketForDaysOverdue(0)).toBeNull();
    expect(bucketForDaysOverdue(-1)).toBeNull();
  });
  it("picks overdue_1 for 1-6 days", () => {
    expect(bucketForDaysOverdue(1)).toBe("overdue_1");
    expect(bucketForDaysOverdue(6)).toBe("overdue_1");
  });
  it("picks overdue_7 for 7-13 days", () => {
    expect(bucketForDaysOverdue(7)).toBe("overdue_7");
    expect(bucketForDaysOverdue(13)).toBe("overdue_7");
  });
  it("picks overdue_14 for 14-29 days", () => {
    expect(bucketForDaysOverdue(14)).toBe("overdue_14");
    expect(bucketForDaysOverdue(29)).toBe("overdue_14");
  });
  it("picks overdue_30 for 30+ days", () => {
    expect(bucketForDaysOverdue(30)).toBe("overdue_30");
    expect(bucketForDaysOverdue(365)).toBe("overdue_30");
  });
});
