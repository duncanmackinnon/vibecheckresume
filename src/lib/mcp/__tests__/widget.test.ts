/** @jest-environment jsdom */
import { trackerWidgetHtml } from '../widget';

it('uses full stage totals for a 50-item page and preserves them while reading application details', () => {
  const html = trackerWidgetHtml();
  document.documentElement.innerHTML = html;
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1])();
  const applications = Array.from({ length: 50 }, (_, index) => ({ id: `application-${index}`, company: 'Acme', role: `Engineer ${index}`, stage: 'Applied', version: 1 }));
  const deliver = (structuredContent: unknown) => window.dispatchEvent(new MessageEvent('message', { source: window, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent } } }));
  deliver({ applications, total: 80, stageCounts: { Applied: 60, Interview: 20 }, tasks: [] });
  expect(document.querySelectorAll('.card')).toHaveLength(50);
  expect(document.getElementById('count')?.textContent).toBe('50 of 80 applications shown');
  expect(document.getElementById('stage-counts')?.textContent).toBe('Applied 60Interview 20');
  deliver({ application: applications[0], entries: [] });
  expect(document.querySelectorAll('.card')).toHaveLength(0);
  expect(document.getElementById('stage-counts')?.textContent).toBe('Applied 60Interview 20');
});
