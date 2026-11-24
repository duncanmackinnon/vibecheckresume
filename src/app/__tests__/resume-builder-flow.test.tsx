import { redirect } from 'next/navigation';
import ResultPage from '../result/page';
import ResumeBuilderPage from '../resume-builder/page';
import ResumePreviewPage from '../resume-preview/page';
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
test.each([ResultPage, ResumeBuilderPage, ResumePreviewPage])('old links lead to explicit legacy import', Page => {
  Page();
  expect(redirect).toHaveBeenCalledWith('/resumes?import=1');
});
