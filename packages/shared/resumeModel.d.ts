export type ResumeExperience = {
    company?: string;
    roleTitle?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    dateRange?: string;
    bullets?: string[];
};
export type ResumeEducation = {
    institution?: string;
    degree?: string;
    location?: string;
};
export type ResumeModel = {
    heading?: {
        name?: string;
        contactLine?: string;
        links?: string[];
    };
    summary?: string;
    competencies?: string[];
    coreCompetencies?: string[];
    experience?: ResumeExperience[];
    education?: ResumeEducation[];
};
