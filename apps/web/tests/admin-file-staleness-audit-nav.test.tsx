import { render, screen } from "@testing-library/react";

import AdminLayout from "@/app/(app)/admin/layout";

describe("admin navigation", () => {
  it("exposes File Staleness Audit in the admin shell", async () => {
    render(await AdminLayout({ children: <div>Admin content</div> }));

    expect(screen.getByRole("link", { name: "File Staleness Audit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "File Staleness Audit" })).toHaveAttribute(
      "href",
      "/admin/file-staleness-audit",
    );
  });
});
