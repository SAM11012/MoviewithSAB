import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const Meetings = pgTable('meetings', {
    id: text('id').primaryKey().notNull(),
    hostId: text('host_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const Messages = pgTable('messages', {
    id: text('id').primaryKey().notNull(),
    meetingId: text('meeting_id')
        .notNull()
        .references(() => Meetings.id),
    userId: text('user_id').notNull(),
    content: text('content').notNull(),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
});