from pathlib import Path
path = Path('apps/api/src/docx-templates/mappers/resume-sections-to-model.ts')
text = path.read_text()
start = text.index('const SECTION_ORDER')
end_token = 'const SKILL_PROSE_PATTERN'
end = text.index(end_token)
end = text.index('\n', end) + 
