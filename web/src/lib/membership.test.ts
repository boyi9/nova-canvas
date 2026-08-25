import { membershipPlans } from "@/lib/membership";

describe("membership data", () => {
    it("exposes free, pro and team plans", () => {
        const ids = membershipPlans.map((p) => p.id);
        expect(ids).toEqual(["free", "pro", "team"]);
    });

    it("has exactly one highlighted plan", () => {
        expect(membershipPlans.filter((p) => p.highlight).length).toBe(1);
    });

    it("every plan has a name, price and at least one feature", () => {
        for (const plan of membershipPlans) {
            expect(plan.nameKey).toMatch(/^membership\.plan\./);
            expect(plan.priceKey).toMatch(/^membership\.plan\./);
            expect(plan.featuresKey.length).toBeGreaterThan(0);
        }
    });
});
