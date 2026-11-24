import { buildStarterResume, createStarterResumeAnswers, escapeResumeLatex, starterResumeAnswersSchema, validateStarterResume } from '../starter-resume';

function firstJobAnswers() {
  return { ...createStarterResumeAnswers('Alex Rivera'), email: 'alex@example.test', skills: 'Customer service, French, spreadsheets' };
}

test('a first-time seeker can make a useful resume without invented employment, education, dates or projects', () => {
  const draft = buildStarterResume(firstJobAnswers());
  expect(draft.generatedResume.preview.sections.map(section => section.title)).toEqual(['Skills']);
  expect(draft.sourceText).toContain('Customer service, French, spreadsheets');
  expect(draft.sourceText).not.toMatch(/EXPERIENCE|EDUCATION|PROJECTS|202\d|Employer|University/);
  expect(draft.generatedResume.assumptions).toEqual([]);
  expect(draft.generatedResume.tailoringNotes).toEqual([]);
  expect(draft.filename).toBe('alex-rivera-base-resume.txt');
});

test('preview, source text and LaTeX consistently preserve the supplied facts', () => {
  const input = {
    ...firstJobAnswers(), headline: 'Community program assistant', summary: 'I organize community events and speak French.',
    experience: [{ role: 'Volunteer coordinator', organization: 'Oak Community Centre', dates: 'March 2025 – June 2026', highlights: 'Organized a weekly welcome desk\n- Created a volunteer checklist' }],
    education: [{ qualification: 'First aid training', institution: 'Local Training Centre', dates: 'May 2026', details: 'Completed practical first aid exercises.' }],
    projects: [{ name: 'Community garden', url: 'https://example.test/garden', description: 'Coordinated the planting schedule.' }],
  };
  const draft = buildStarterResume(input);
  expect(draft.generatedResume.preview.sections.map(section => section.title)).toEqual(['Experience', 'Education', 'Projects', 'Skills']);
  expect(draft.generatedResume.preview.sections[0].items[0]).toMatchObject({ heading: 'Volunteer coordinator', subheading: 'Oak Community Centre', date: 'March 2025 – June 2026', details: ['Organized a weekly welcome desk', 'Created a volunteer checklist'] });
  for (const fact of ['Oak Community Centre', 'First aid training', 'Community garden', 'Coordinated the planting schedule.']) {
    expect(draft.sourceText).toContain(fact);
    expect(draft.generatedResume.latex).toContain(fact);
  }
  expect(buildStarterResume(input)).toEqual(draft);
});

test('empty optional rows stay absent and duplicate skills do not create repeated claims', () => {
  const draft = buildStarterResume({ ...firstJobAnswers(), skills: 'French, French\nSpreadsheets; french\nCustomer service' });
  expect(draft.generatedResume.preview.sections).toEqual([{ title: 'Skills', items: [{ heading: 'French, Spreadsheets, Customer service', details: [] }] }]);
  expect(draft.generatedResume.preview.summary).toBeUndefined();
  expect(draft.generatedResume.preview.headline).toBeUndefined();
  expect(draft.answers.experience[0].dates).toBe('');
});

test('LaTeX special characters and commands in answers remain literal text', () => {
  expect(escapeResumeLatex('A&B_50% $ # {x} ~ ^ \\')).toBe('A\\&B\\_50\\% \\$ \\# \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}');
  const draft = buildStarterResume({ ...firstJobAnswers(), summary: 'Used R&D tools. \\input{private-file} 100% work.' });
  expect(draft.generatedResume.latex).not.toContain('\\input{private-file}');
  expect(draft.generatedResume.latex).toContain('\\textbackslash{}input\\{private-file\\}');
  expect(draft.sourceText).toContain('\\input{private-file}');
});

test('validation requires name, a contact method and actual content, while allowing optional history', () => {
  expect(validateStarterResume(createStarterResumeAnswers())).toEqual(expect.arrayContaining(['Add your name.', 'Add an email, phone number, or contact link.']));
  expect(validateStarterResume({ ...firstJobAnswers(), skills: ', ;\n,' })).toContain('Add a short introduction, a skill, education, a project, or experience to include in your resume.');
  expect(validateStarterResume({ ...firstJobAnswers(), email: 'not an email' })).toContain('Enter a valid email address.');
  expect(validateStarterResume({ ...firstJobAnswers(), email: '', phone: '555-0100' })).toEqual([]);
  expect(validateStarterResume({ ...firstJobAnswers(), email: '', links: 'https://example.test/contact' })).toEqual([]);
});

test('server parser rejects excess fields, oversized answers and unbounded repeated entries', () => {
  expect(starterResumeAnswersSchema.safeParse({ ...firstJobAnswers(), generatedResume: { latex: 'untrusted' } }).success).toBe(false);
  expect(starterResumeAnswersSchema.safeParse({ ...firstJobAnswers(), summary: 'x'.repeat(4001) }).success).toBe(false);
  expect(starterResumeAnswersSchema.safeParse({ ...firstJobAnswers(), experience: Array.from({ length: 11 }, () => ({ role: 'Helper' })) }).success).toBe(false);
  expect(validateStarterResume({ ...firstJobAnswers(), projects: [{ name: '', url: '', description: 'Built a project.' }] })).toContain('Give this project a name.');
});

test('normalization does not mutate controlled answers or fill missing facts', () => {
  const input = { ...firstJobAnswers(), fullName: '  Alex Rivera  ', summary: '  A real introduction.\r\nAnother actual sentence.  ' };
  const before = JSON.stringify(input);
  const draft = buildStarterResume(input);
  expect(JSON.stringify(input)).toBe(before);
  expect(draft.answers.fullName).toBe('Alex Rivera');
  expect(draft.answers.summary).toBe('A real introduction.\nAnother actual sentence.');
  expect(draft.answers.education[0].qualification).toBe('');
});
