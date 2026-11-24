export function localDateTimeToIso(local: string, timezone: string): string {
  if (!local) throw new Error('Choose an interview time.');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!parts) throw new Error('Enter a valid interview date and time.');
  const [, year, month, day, hour, minute] = parts.map(Number);
  const requested = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(requested).toISOString().slice(0, 16) !== local) throw new Error('Enter a valid interview date and time.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let stamp = requested;
  for (let i = 0; i < 4; i++) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    const represented = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute);
    if (represented === requested) return new Date(stamp).toISOString();
    stamp += requested - represented;
  }
  throw new Error('That local time does not exist because of a daylight-saving change. Choose another time.');
}
export function inputLocalDateTime(value: string | null, timezone: string): string {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

