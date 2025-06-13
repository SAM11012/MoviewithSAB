'use client';

import { Suspense } from 'react';
import MeetingInner from "@/components/Meeting";


export default function MeetingPage() {


    return (

        <Suspense fallback={<div className="p-4">Loading meeting...</div>}>
            <MeetingInner />
        </Suspense>
    );
}
