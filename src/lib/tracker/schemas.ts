import { z } from 'zod';
import { STAGES } from './types';
export const idSchema = z.string().uuid();
const text = (max = 1000) => z.string().trim().max(max);
const url = text(2048).refine(value => !value || /^https?:\/\//i.test(value), 'Use an http or https URL.');
const date = z.union([z.iso.date(), z.literal(''), z.null()]).transform(value => value || null);
const instant = z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).transform(value => value ? new Date(value).toISOString() : null);
export const applicationFields = {
  company: text(200).min(1), role: text(200).min(1), stage: z.enum(STAGES), jobUrl: url,
  jobDescription: text(262144), location: text(200), compensation: text(200), priority: z.enum(['low','medium','high']),
  tags: z.array(text(40).min(1)).max(20), appliedDate: date, deadline: date,
};
const createApplication = z.object({ company: applicationFields.company, role: applicationFields.role,
  stage: applicationFields.stage.default('Saved'), jobUrl: url.default(''), jobDescription: applicationFields.jobDescription.default(''),
  location: applicationFields.location.default(''), compensation: applicationFields.compensation.default(''), priority: applicationFields.priority.default('medium'),
  tags: applicationFields.tags.default([]), appliedDate: date.default(null), deadline: date.default(null),
}).strict();
const versioned = { id: idSchema, expectedVersion: z.number().int().positive() };
const updateApplication = z.object(applicationFields).partial().extend(versioned).strict();
const entryFields = {
  title: text(300).min(1), body: text(20000), dueDate: date, completed: z.boolean(), startAt: instant, endAt: instant,
  timezone: text(100).refine(value => { try { new Intl.DateTimeFormat('en', {timeZone:value}); return true; } catch { return false; } }, 'Choose a valid timezone.'),
  email: z.union([z.email(),z.literal('')]), phone: text(100), url, contactRole: text(200),
};
const entry = z.object({ applicationId:idSchema, title:entryFields.title, body:entryFields.body.default(''), dueDate:date.default(null), completed:z.boolean().default(false),
  startAt:instant.default(null), endAt:instant.default(null), timezone:entryFields.timezone.default('UTC'), email:entryFields.email.default(''), phone:entryFields.phone.default(''),url:url.default(''),contactRole:entryFields.contactRole.default('') }).strict();
const entryUpdate = z.object(entryFields).partial().extend(versioned).strict();
export const actionSchemas: Record<string,z.ZodType> = {
  create_application:createApplication, update_application:updateApplication, archive_application:z.object(versioned).strict(),restore_application:z.object(versioned).strict(),
  add_note:entry,update_note:entryUpdate,create_contact:entry,update_contact:entryUpdate,create_task:entry,update_task:entryUpdate,create_interview:entry,update_interview:entryUpdate,
  delete_entry:z.object(versioned).strict(),
};
export const actionRequestSchema = z.object({action:z.string(),input:z.unknown(),idempotencyKey:z.string().min(1).max(200)}).strict();
