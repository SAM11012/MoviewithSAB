import { currentUser } from '@clerk/nextjs/server';
import { uuid } from 'uuidv4';
import {db} from '@/db'
import { eq } from 'drizzle-orm';
import { Meetings, Messages } from '@/schema';
export async function POST(req: Request) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const user = await currentUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    if (action === 'create') {
        const id = uuid();
        await db.insert(Meetings).values({ id, hostId: user.id });
        return new Response(JSON.stringify({ meetingId: id }));
    }

    const payload = await req.json();
    if (action === 'message') {
        await db.insert(Messages).values({
            id: uuid(),
            meetingId: payload.meetingId,
            userId: user.id,
            content: payload.content,
        });
        return new Response('OK');
    }

    return new Response('Bad Request', { status: 400 });
}

export async function GET(req: Request) {
    const { meetingId } = Object.fromEntries(new URL(req.url).searchParams);
    const messages = await db
        .select()
        .from(Messages)
        .where(eq(Messages.meetingId, meetingId))
        .orderBy(Messages.sentAt);
    return new Response(JSON.stringify(messages));
}
