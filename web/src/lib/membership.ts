export interface MembershipPlan {
    id: "free" | "pro" | "team";
    nameKey: string;
    priceKey: string;
    featuresKey: string[];
    highlight?: boolean;
}

export const membershipPlans: MembershipPlan[] = [
    {
        id: "free",
        nameKey: "membership.plan.free.name",
        priceKey: "membership.plan.free.price",
        featuresKey: [
            "membership.planfree.f1",
            "membership.planfree.f2",
            "membership.planfree.f3",
        ],
    },
    {
        id: "pro",
        nameKey: "membership.plan.pro.name",
        priceKey: "membership.plan.pro.price",
        highlight: true,
        featuresKey: [
            "membership.planpro.f1",
            "membership.planpro.f2",
            "membership.planpro.f3",
            "membership.planpro.f4",
        ],
    },
    {
        id: "team",
        nameKey: "membership.plan.team.name",
        priceKey: "membership.plan.team.price",
        featuresKey: [
            "membership.planteam.f1",
            "membership.planteam.f2",
            "membership.planteam.f3",
        ],
    },
];
