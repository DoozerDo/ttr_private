import { render, screen } from "@testing-library/react";
import { ResumePreview } from "@/app/(app)/studio/ResumePreview";

describe("ResumePreview", () => {
  const payload = {
    preview: {
      resume: {
        heading: {
          name: "Alex Candidate",
          contactLine: "(703) 850-7289 | alex@example.com",
        },
        experience: [
          {
            company: "Cat Daddy Games",
            roleTitle: "Senior Producer",
            location: "Kirkland, WA",
            dateRange: "2021 - Present",
            bullets: [
              "Led live operations roadmap delivery across multiple game releases.",
              "Improved release quality through tighter cross-team planning.",
            ],
          },
        ],
      },
    },
  };

  it("renders structured heading and professional experience from canonical model", () => {
    render(<ResumePreview payload={payload} />);
    expect(screen.getByText("Alex Candidate")).toBeInTheDocument();
    expect(screen.getByText("Professional Experience")).toBeInTheDocument();
    expect(screen.getByText("Cat Daddy Games")).toBeInTheDocument();
    expect(screen.getByText("Senior Producer | Kirkland, WA")).toBeInTheDocument();
    expect(screen.getByText("2021 - Present")).toBeInTheDocument();
  });

  it("renders discrete bullet list items", () => {
    render(<ResumePreview payload={payload} />);
    const bullets = screen.getAllByRole("listitem");
    expect(bullets).toHaveLength(2);
    expect(screen.getByText("Led live operations roadmap delivery across multiple game releases.")).toBeInTheDocument();
    expect(screen.getByText("Improved release quality through tighter cross-team planning.")).toBeInTheDocument();
  });

  it("renders each experience entry in a distinct visual block", () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Principal Program Manager",
                  dateRange: "2021 - Present",
                  bullets: ["Led complex delivery across cross-functional programs."],
                },
                {
                  company: "Employer Two",
                  roleTitle: "Program Manager",
                  dateRange: "2018 - 2021",
                  bullets: ["Drove roadmap execution for multiple products."],
                },
              ],
            },
          },
        }}
      />,
    );

    const companyHeadings = screen.getAllByText(/Employer One|Employer Two/);
    expect(companyHeadings).toHaveLength(2);
    expect(screen.getAllByTestId("experience-entry-block")).toHaveLength(2);
  });

  it("deduplicates merged education tokens and structural duplicate rows at render boundary", () => {
    render(
      <ResumePreview
        payload={{
          preview: {
            resume: {
              heading: { name: "Alex Candidate", contactLine: "alex@example.com" },
              experience: [
                {
                  company: "Employer One",
                  roleTitle: "Principal Program Manager",
                  dateRange: "2021 - Present",
                  bullets: ["Led complex delivery across cross-functional programs."],
                },
              ],
              education: [
                {
                  degree:
                    "Master of Science in Interactive Entertainment Design & Production | Master of Science in Interactive Entertainment Design & Production",
                  institution:
                    "University of Central Florida, Orlando, FL | University of Central Florida, Orlando, FL",
                },
                {
                  degree:
                    "Master of Science in Interactive Entertainment Design & Production",
                  institution: "University of Central Florida, Orlando, FL",
                },
        {
          degree:
            "Bachelor of Arts in Art & Visual Technology | Bachelor of Arts in Art & Visual Technology",
          institution:
            "George Mason University, Fairfax, VA | George Mason University, Fairfax, VA",
        },
        {
          degree:
            "Master of Science in Interactive Entertainment Design & Production",
          institution:
            "Master of Science in Interactive Entertainment Design & Production | University of Central Florida, Orlando, FL",
          location:
            "University of Central Florida, Orlando, FL",
        },
        {
          degree: "MBA¦MBA｜MBA.",
          institution:
            "University of Washington | University of Washington,",
          location:
            "University of Washington.",
        },
              ],
            },
          },
        }}
      />,
    );

    const msMatches = screen.getAllByText(
      /Master of Science in Interactive Entertainment Design & Production/,
    );
    const baMatches = screen.getAllByText(/Bachelor of Arts in Art & Visual Technology/);
    const ucfMatches = screen.getAllByText(/University of Central Florida, Orlando, FL/);
    const gmuMatches = screen.getAllByText(/George Mason University, Fairfax, VA/);
    const mbaMatches = screen.getAllByText(/\bMBA\b/);
    const uwMatches = screen.getAllByText(/University of Washington/);

    expect(msMatches).toHaveLength(1);
    expect(baMatches).toHaveLength(1);
    expect(ucfMatches).toHaveLength(1);
    expect(gmuMatches).toHaveLength(1);
    expect(mbaMatches).toHaveLength(1);
    expect(uwMatches).toHaveLength(1);
    expect(
      screen.queryByText(
        /Master of Science in Interactive Entertainment Design & Production \| Master of Science in Interactive Entertainment Design & Production/,
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        /University of Central Florida, Orlando, FL \| University of Central Florida, Orlando, FL/,
      ),
    ).toBeNull();
  });

  it("does not render section-fragment payloads when canonical preview model is missing", () => {
    render(
      <ResumePreview
        payload={{
          sections: [{ type: "EXPERIENCE", content: "Page 1 3\nCompany\nmathematical" }],
        }}
      />,
    );
    expect(screen.queryByTestId("resume-preview")).toBeNull();
  });
});
