import OpportunitiesRedirectPage from "@/app/(app)/opportunities/page";
import { mockRedirect } from "@/tests/setup";

describe("Opportunities route", () => {
  it("redirects to the canonical opportunities destination", () => {
    OpportunitiesRedirectPage();
    expect(mockRedirect).toHaveBeenCalledWith("/job-tracker");
  });
});
