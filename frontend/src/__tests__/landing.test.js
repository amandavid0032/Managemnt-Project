import { dashboardMemberships, landingPathFor } from "../auth/landing.js";

const m = (slug, role, institutionId = slug) => ({ slug, role, institutionId, name: slug });

describe("landingPathFor", () => {
  it("sends anonymous visitors to sign in", () => {
    expect(landingPathFor(null)).toBe("/login");
  });

  it("sends platform staff to the admin panel even if they also run a school", () => {
    expect(landingPathFor({ platformRole: "SUPER_ADMIN" }, [m("a", "INSTITUTION_ADMIN")])).toBe("/admin");
    expect(landingPathFor({ platformRole: "PLATFORM_ADMIN" })).toBe("/admin");
  });

  it("sends a school admin or staff member with one institution straight to it", () => {
    expect(landingPathFor({ platformRole: "USER" }, [m("northgate", "INSTITUTION_ADMIN")])).toBe("/school/northgate");
    expect(landingPathFor({ platformRole: "USER" }, [m("northgate", "STAFF")])).toBe("/school/northgate");
  });

  it("asks a person with several institutions to choose", () => {
    expect(
      landingPathFor({ platformRole: "USER" }, [m("a", "INSTITUTION_ADMIN"), m("b", "STAFF")]),
    ).toBe("/school");
  });

  it("does NOT give teachers or students a dashboard — they land on their profile", () => {
    expect(landingPathFor({ platformRole: "USER" }, [m("a", "TEACHER"), m("b", "STUDENT")])).toBe("/profile");
  });
});

describe("dashboardMemberships", () => {
  it("lists each institution once, preferring the admin role", () => {
    const result = dashboardMemberships([m("a", "STAFF"), m("a", "INSTITUTION_ADMIN"), m("b", "STUDENT")]);
    expect(result).toEqual([m("a", "INSTITUTION_ADMIN")]);
  });
});
