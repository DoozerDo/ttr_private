import ApplicationsRedirectPage from "@/app/(app)/applications/page";
import OpportunitiesRedirectPage from "@/app/(app)/opportunities/page";
import { mockRedirect } from "@/tests/setup";
import { getRouteById } from "@/src/navigation/routes";

describe("beta tracker routing", () => {
  it("redirects /applications to canonical /job-tracker", () => {
    ApplicationsRedirectPage();
    expect(mockRedirect).toHaveBeenCalledWith("/job-tracker");
  });

  it("redirects /opportunities to canonical /job-tracker", () => {
    OpportunitiesRedirectPage();
    expect(mockRedirect).toHaveBeenCalledWith("/job-tracker");
  });

  it("maps the primary tracker nav route to /job-tracker", () => {
    const trackerRoute = getRouteById("jobTracker");
    expect(trackerRoute?.href).toBe("/job-tracker");
    expect(trackerRoute?.label).toBe("Opportunities");
  });
});
