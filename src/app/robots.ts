import { createRobots, getSeoContext } from '@/lib/seo';

export const dynamic = 'force-static';
export default async function robots() { return createRobots(await getSeoContext()); }
