// PawBond — Edge Function: send-birthday-memorial
// Runs hourly. Sends a rich push notification when:
//   • A pet's birthday matches today's month+day (in the user's timezone)
//   • A memorial pet's memorial_at date matches today's month+day (anniversary)
//
// Timezone-aware delivery: each user receives the notification at 8–9 AM in
// their stored timezone. The cron fires every hour; users whose local clock
// falls in that window at the current UTC hour are processed. Year-based dedup
// ensures no user gets the same pet's notification twice in a year.
//
// Features:
//   • 50 birthday templates + 50 memorial templates — randomly selected
//   • Per-user dedup: different pets belonging to the same owner get different templates
//   • Attach a random pet photo (from pet_photos) or fall back to avatar_url
//   • Respects quiet hours via shared prefs helper
//   • Records sent template_idx per user+pet+year so the same template isn't reused next year
//
// Deploy:  supabase functions deploy send-birthday-memorial
// Cron:    0 * * * *   (every hour — delivers at local 8 AM per user timezone)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { filterByPref } from './prefs.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isCronAuthorized(req: Request): boolean {
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CRON_SECRET = Deno.env.get('CRON_SECRET');
  const incoming    = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  return CRON_SECRET ? incoming === CRON_SECRET : incoming === SERVICE_KEY;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── 50 Birthday templates ─────────────────────────────────────────────────────
// {name} = pet name, {age} = age in years (omitted if unknown)
const BIRTHDAY_TEMPLATES: Array<{ title: string; body: string }> = [
  { title: '🎂 Happy Birthday, {name}!',         body: 'Today is {name}\'s special day! Give them an extra cuddle and their favourite treat. 🐾' },
  { title: '🎉 It\'s {name}\'s birthday!',        body: 'Another year of unconditional love, endless joy, and wet-nose kisses. Celebrate big today! 🥳' },
  { title: '🐾 Birthday paws for {name}!',        body: 'Your furry best friend is officially another year more wonderful. Make it a day to remember! 🎈' },
  { title: '🎁 Surprise, {name}!',                body: 'Cake? Treats? Belly rubs? Today is ALL about {name}. Go spoil them rotten! 🎂' },
  { title: '🌟 A star is {age} today!',           body: '{name} has been lighting up your life for {age} amazing years. Here\'s to many more! ✨' },
  { title: '🥳 Party time for {name}!',           body: 'Balloons, treats, and a very good dog/cat/pet — what more could you want? Happy birthday! 🎊' },
  { title: '🐕 {name}\'s big day is here!',       body: 'Woof, meow, or squeak — however {name} says it, today they\'re saying "IT\'S MY BIRTHDAY!" 🎉' },
  { title: '🎈 Wishing {name} a pawsome day!',    body: 'May your day be filled with belly rubs, tasty snacks, and all the love in the world. 💕' },
  { title: '🌈 Happy {age}th, {name}!',           body: '{age} years of cuddles, zoomies, and pure happiness. You\'re the best thing ever, {name}! 🌟' },
  { title: '🎂 {name} is {age} today!',           body: 'Every year with {name} has been an adventure. Celebrate this pawsome milestone! 🐾' },
  { title: '💛 {name}\'s birthday glow-up!',      body: 'Another year older, another year more perfect. {name} just keeps getting better! ✨' },
  { title: '🎉 Hip hip hooray for {name}!',       body: 'Today the world is a little bit better because {name} is in it. Happy birthday, sweet one! 🥳' },
  { title: '🐾 Treat time for {name}!',           body: 'Rules for today: extra treats allowed, no guilt, all cuddles. It\'s {name}\'s birthday! 🎂' },
  { title: '🌸 Happy birthday, beautiful {name}!',body: 'You\'re not just a pet — you\'re family, a best friend, and a daily dose of joy. 💕' },
  { title: '🎊 Party ears on, {name}!',           body: 'Pop the confetti! {name} officially has another year of adventures ahead. Let\'s go! 🚀' },
  { title: '🍰 Birthday cake for {name}!',        body: 'Okay, make it a dog-safe cake. But {name} deserves ALL the celebration today! 🎉' },
  { title: '✨ {name} is {age} — unbelievable!',  body: 'Time flies when you\'re this happy. {age} years with {name} and every day is a gift. 💛' },
  { title: '🐩 {name}\'s birthday bash!',         body: 'Dress code: party hats. Activity: maximum spoiling. Guest of honour: the one, the only, {name}! 🎈' },
  { title: '🌟 Today\'s VIP: {name}',             body: 'Very Important Pet. {name} gets the royal treatment today — and every day, honestly. 👑' },
  { title: '🎁 A whole new year for {name}!',     body: 'A new year means new adventures, new sniffs, new naps, and endless love. Happy birthday! 🐾' },
  { title: '💐 Flowers for {name}\'s birthday!',  body: 'Okay, maybe not flowers — a favourite toy will do. {name} deserves all the good things! 🌸' },
  { title: '🎂 You\'re {age}, {name}!',           body: 'Not just a number — {age} is the count of years you\'ve made every single day brighter. 💕' },
  { title: '🥰 Smooch! Happy birthday, {name}!', body: 'Today you get ALL the kisses and NONE of the lectures about jumping on furniture. Deal? 😄' },
  { title: '🎉 {name}\'s birthday countdown: 🎉', body: '3… 2… 1… HAPPY BIRTHDAY! Now go get those zoomies out, birthday star! 🌟' },
  { title: '🐾 Pawprint on our hearts, {name}!', body: '{name} has left a pawprint on your heart that will never fade. Happy birthday, dear one. 💛' },
  { title: '🌈 {age} years of {name}!',           body: '{age} years of morning greetings, couch cuddles, and the best kind of love. Here\'s to you! 🎊' },
  { title: '🎈 Inflate the balloons for {name}!', body: 'It\'s the one day a year where {name} is even more the centre of the universe than usual! 🥳' },
  { title: '🍖 Treat budget: unlimited today!',   body: 'Birthday rules say {name} gets anything they want today. You said it, not us! 🎂' },
  { title: '💫 {name} shines brighter at {age}!', body: 'Like fine wine — better with every year. {name} is officially {age} and absolutely perfect. ✨' },
  { title: '🎉 Calling all {name} fans!',         body: 'It\'s the birthday of the goodest, sweetest, most wonderful pet in the world. 🎁' },
  { title: '🐾 {name}: {age} years of magic!',    body: 'Magic doesn\'t always come with a wand. Sometimes it comes with four paws and a wagging tail. 🌟' },
  { title: '🎊 {name}\'s special day is here!',   body: 'No agenda today. Just love, treats, and quality time with the star of the show — {name}! 💕' },
  { title: '🌟 Lights, camera, {name}!',          body: 'Today we celebrate the one who makes every ordinary day extraordinary. Happy birthday! 🎂' },
  { title: '🎁 Unwrap the joy — it\'s {name}!',   body: 'Every day with {name} is a gift. But today especially deserves to be celebrated! 🎉' },
  { title: '🥳 Who\'s a birthday pet? {name}!',   body: 'You asked. They answered. It\'s {name}\'s birthday and they\'re ready to PARTY! 🎈' },
  { title: '🐕 {name}: officially {age}!',        body: 'Age is just a number, and {name} proves it — still puppy-level energy, triple the wisdom! 😄' },
  { title: '💛 Born to be loved: {name}',         body: 'From the moment {name} arrived, everything got better. {age} years of proof right there. 💐' },
  { title: '🎂 Bake something pawsome!',          body: 'Today\'s menu: birthday treats, belly rubs for breakfast, and naps on the good couch. 🐾' },
  { title: '🌸 {name}: year {age} begins!',       body: 'One chapter closes, another opens. Year {age} is going to be your best one yet, {name}! ✨' },
  { title: '🎉 WOOF! It\'s {name}\'s day!',       body: 'Translation: "Thank you for the food, the walks, the love, and existing. Happy birthday to me!" 🥳' },
  { title: '🏆 MVP of the house: {name}',         body: 'Most Valuable Pet. Every. Single. Year. Today we celebrate the champion of our hearts! 🌟' },
  { title: '🎈 {name} is blowing out candles!',   body: 'Figuratively. But the birthday energy is very real — and very adorable. 🎂' },
  { title: '💕 {age} years of pure love, {name}!',body: '{age} years ago, everything changed for the better. Thank you for choosing us, {name}. 💛' },
  { title: '🎊 The world is {name}\'s today!',    body: 'Streets are renamed. Parades are scheduled. Okay, treats are happening. Same vibe. 🎉' },
  { title: '🐾 {name} turns {age} — legend!',     body: '{age} years of living their best life. A true legend in their own lunchtime (and all other times). 🌟' },
  { title: '🌟 Shine on, birthday star {name}!',  body: 'The sun shines a little brighter on {name}\'s birthday. And every day, actually. 💫' },
  { title: '🎁 Open your heart — it\'s {name}!',  body: '{name} has been the best gift this family ever received. Today we give a little back. 💕' },
  { title: '🥰 {age} and fabulous, {name}!',      body: 'Fabulous fur. Fabulous personality. Fabulous pet. {age} years of absolute fabulousness! ✨' },
  { title: '🎂 Sweet {age}, {name}!',             body: 'May your {age}th year be filled with the treats you love, the naps you deserve, and endless snuggles. 🐾' },
  { title: '🎉 Here\'s to {name}!',               body: 'Raise a treat (not a glass — they\'re a pet). To {name}: the heart of this home. Happy birthday! 💛' },
];

// ── 50 Memorial anniversary templates ─────────────────────────────────────────
// {name} = pet name, {years} = years since passing
const MEMORIAL_TEMPLATES: Array<{ title: string; body: string }> = [
  { title: '🌈 Remembering {name} today',         body: 'A year on, and {name}\'s paw prints are still everywhere — in your heart, in your home, in your memories. 💕' },
  { title: '💜 {name} lives on forever',           body: 'Gone from your arms, never from your heart. {name}\'s love is one that time cannot dim. 🌟' },
  { title: '🌸 In loving memory of {name}',        body: 'Today we remember a soul who gave everything and asked for so little. {name}, you are missed. 🐾' },
  { title: '🌈 Rainbow Bridge anniversary',        body: '{name} crossed the Rainbow Bridge {years} {yearWord} ago. Their love is still with you every single day. 💜' },
  { title: '🕊️ Forever in our hearts, {name}',    body: 'Some bonds are stronger than distance, stronger than time. {name} will always be family. 💛' },
  { title: '⭐ {name}\'s star shines on',          body: 'Look up tonight — there\'s a star that shines a little brighter because {name} is up there. ✨' },
  { title: '💐 Flowers for {name} today',          body: 'On this anniversary, we remember not the goodbye, but the years of hello. Thank you, {name}. 🌸' },
  { title: '🌈 {years} {yearWord} at the Bridge',  body: '{name} has been waiting at the Rainbow Bridge for {years} {yearWord}. They\'re running free and happy. 💜' },
  { title: '🐾 {name}\'s pawprints remain',        body: 'Pawprints on floors fade. Pawprints on hearts never do. {name}, you are so dearly loved. 💕' },
  { title: '💜 A gentle reminder of {name}',       body: 'Today is a day to let the memories wash over you — the good ones, the silly ones, the precious ones. 🌟' },
  { title: '🌟 {name}: forever our good one',      body: 'There is no "was" when it comes to love. {name} is, and always will be, one of the good ones. ✨' },
  { title: '🕊️ Fly high, sweet {name}',           body: 'No more pain, no more limits — just endless fields and sunshine. Rest easy, dear {name}. 🌈' },
  { title: '💛 {name}\'s love never left',         body: 'Love like {name}\'s doesn\'t just disappear. It stays in warm memories, in quiet moments, in your heart. 💜' },
  { title: '🌸 We still feel you, {name}',         body: 'In the morning light, in a rustling leaf, in a familiar smell — {name} says hello from time to time. 🌟' },
  { title: '🐾 Missing you, {name}',               body: 'Missing you is just love with nowhere to go. But somehow, {name}, it always finds its way to you. 💕' },
  { title: '⭐ {years} {yearWord} of missing you', body: '{years} {yearWord} since you left us, {name}. Not a day goes by without a thought of you. 💜' },
  { title: '🌈 Always our family, {name}',         body: 'Family doesn\'t end with a goodbye. {name} is still as much a part of this family as ever. 💛' },
  { title: '💜 Grief is just love, {name}',        body: 'They say grief is love with nowhere to go. We prefer to think {name} is still receiving every bit of it. 🌸' },
  { title: '🕊️ At peace, sweet {name}',           body: 'We take comfort knowing {name} is free, happy, and no longer in any pain. Until we meet again. 🌈' },
  { title: '🌟 {name}: the one who changed us',    body: 'Pets don\'t just share our lives — they shape them. {name} made us better, kinder, more patient. 💕' },
  { title: '🐾 A year of carrying you with us',    body: 'Everywhere we go, {name} comes with us — in the laughter, in the tears, in the love. 💜' },
  { title: '💛 Your memory is a treasure, {name}',body: 'Some treasures can\'t be held — only felt. {name}\'s memory is one of our most precious. ✨' },
  { title: '🌸 The house remembers {name}',        body: 'The favourite spot by the window. The familiar sound of paws. Home always remembers {name}. 🏡' },
  { title: '🌈 Running free now, {name}',          body: 'Imagine {name}: no leash, no limits, just open fields and sunshine for ever. That\'s the picture. 🌟' },
  { title: '⭐ You taught us so much, {name}',     body: '{name} taught us how to love without condition, to live in the moment, and to be wholly present. 💕' },
  { title: '💜 Tender anniversary for {name}',     body: 'Today isn\'t just about sadness. It\'s about gratitude — for every year, every day, every moment with {name}. 🌸' },
  { title: '🕊️ {name}\'s gentle spirit lives on', body: 'Gentle souls leave gentle marks. {name}\'s mark on this family will never, ever fade. 💛' },
  { title: '🌟 Thank you for everything, {name}',  body: 'For the mornings, the evenings, the lazy days, the adventures — thank you for all of it, {name}. 🐾' },
  { title: '🐾 {name}: {years} {yearWord} ago',    body: '{years} {yearWord} since that heartbreaking goodbye. The love hasn\'t shrunk one bit since then. 💜' },
  { title: '💕 Love that outlasts a lifetime',     body: '{name}\'s love didn\'t end. It just changed form — from warm fur to warm memory. 🌸' },
  { title: '🌈 Another year, same love for {name}',body: 'A year passes, the grief softens a little, but the love stays exactly the same size. 💜' },
  { title: '✨ You were perfect, {name}',           body: 'Not despite the quirks, the mischief, the stubbornness — because of them. {name} was perfectly {name}. 💕' },
  { title: '🌸 Honouring {name} today',            body: 'Today we light a candle in our hearts for {name}. May the warmth reach you wherever you are. 🕊️' },
  { title: '💛 {name}\'s favourite day was today', body: 'Actually, every day with you was {name}\'s favourite day. What a gift to have been so loved. 🌟' },
  { title: '🐾 Paw to heart: always, {name}',      body: 'From their paw to your heart, {name} made a connection that cannot be broken by distance or time. 💜' },
  { title: '🌈 Heaven got a good one, {name}',     body: 'Wherever {name} is now, they\'re charming absolutely everyone — same as they always did. ⭐' },
  { title: '💕 Remembering your first hello, {name}',body:'You still remember the first day. {name} walked in and the whole house changed — forever, for the better. 🌸' },
  { title: '🕊️ {years} {yearWord} of love unchanged',body:'{years} {yearWord} and the love is the same size it was on day one. That\'s who {name} was. 💜' },
  { title: '⭐ Light a candle for {name}',          body: 'On this anniversary, hold a memory close. {name} is remembered, loved, and never truly gone. 🌟' },
  { title: '🌟 The greatest teacher: {name}',       body: '{name} showed us what unconditional love looks like in practice, every single day. A true teacher. 💛' },
  { title: '💜 Soft thoughts of {name} today',      body: 'Today, be gentle with yourself. Let the memories be soft and sweet. {name} would want that for you. 🌸' },
  { title: '🐾 {name}\'s legacy: a home full of love',body:'The love {name} brought into this home didn\'t leave with them. It stayed, and it always will. 💕' },
  { title: '🌈 Until we meet again, {name}',        body: 'That\'s not a goodbye — it\'s a "see you later." We\'ll find each other again, {name}. We know it. 🕊️' },
  { title: '✨ Joy you gave us, {name}',             body: 'The joy {name} brought can\'t be calculated. It just fills every corner of every good memory. 💛' },
  { title: '🌸 A lifetime of good days with {name}',body:'Not all days were easy, but every day with {name} was worth having. What a beautiful truth. 💜' },
  { title: '💕 Still talking to you, {name}',       body: 'Some people still talk to the ones they\'ve lost. That\'s not sadness — that\'s love refusing to quit. 🌟' },
  { title: '🐾 {name}\'s smile lives in you',       body: 'Every time you smile thinking of {name}, that\'s them — still making you happy, still doing their job. ⭐' },
  { title: '🌈 Sending love across the Bridge',     body: '{name}, wherever you are: this family still loves you. That will never, ever change. 💜' },
  { title: '💛 For {name}, on this quiet day',      body: 'Some anniversaries don\'t need big gestures — just a quiet moment, a fond memory, and love. 🕊️' },
  { title: '🌟 {name}: loved, remembered, forever', body: 'Three things that will never change: {name} was loved, {name} is remembered, {name} lives on in us. 💕' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fillTemplate(tpl: { title: string; body: string }, vars: Record<string, string>) {
  let title = tpl.title;
  let body = tpl.body;
  for (const [k, v] of Object.entries(vars)) {
    title = title.replaceAll(`{${k}}`, v);
    body  = body.replaceAll(`{${k}}`, v);
  }
  return { title, body };
}

function todayMMDD(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** MM-DD in the user's timezone — handles date boundary differences. */
function localMMDD(tz: string | null | undefined): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      month: '2-digit', day: '2-digit', timeZone: tz ?? 'UTC',
    }).formatToParts(now);
    const mm = parts.find(p => p.type === 'month')?.value ?? '';
    const dd = parts.find(p => p.type === 'day')?.value ?? '';
    return `${mm}-${dd}`;
  } catch {
    return todayMMDD();
  }
}

/** Returns true if it's currently 8:00–9:59 AM in the given timezone. */
function isMorningFor(tz: string | null | undefined): boolean {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC',
    }).formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    return h >= 8 && h < 10;
  } catch {
    // Unknown timezone — fall back to UTC hour
    return now.getUTCHours() >= 8 && now.getUTCHours() < 10;
  }
}

function yearsSince(iso: string): number {
  const past = new Date(iso);
  const now  = new Date();
  return now.getUTCFullYear() - past.getUTCFullYear();
}

function ageFromBirthday(iso: string): number | null {
  try {
    const born = new Date(iso);
    const now  = new Date();
    return now.getUTCFullYear() - born.getUTCFullYear();
  } catch { return null; }
}

/** Pick a template index that hasn't been used for this user today, from the given pool size. */
function pickTemplateIdx(usedIdxs: Set<number>, poolSize: number): number {
  const available = Array.from({ length: poolSize }, (_, i) => i).filter(i => !usedIdxs.has(i));
  if (available.length === 0) {
    // All templates used — just pick any random one
    return Math.floor(Math.random() * poolSize);
  }
  return available[Math.floor(Math.random() * available.length)];
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok', 200);
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Build a set of MM-DD values covering UTC yesterday/today/tomorrow — this ensures
  // no timezone is missed when pre-filtering pets before the per-user local date check.
  const now = new Date();
  const mmddSet = new Set([-1, 0, 1].map(offset => {
    const d = new Date(now.getTime() + offset * 86_400_000);
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }));

  const thisYear = now.getUTCFullYear();

  // ── 1. Find birthday pets (active, birthday month+day in ±1 day window) ───
  const { data: birthdayPets } = await supabase
    .from('pets')
    .select('id, name, species, emoji, owner_id, birthday, avatar_url, status')
    .eq('is_active', true)
    .eq('status', 'active')
    .not('birthday', 'is', null);

  const birthdayMatches = (birthdayPets ?? []).filter((p: any) => {
    if (!p.birthday) return false;
    const [, mm, dd] = p.birthday.split('-');
    return mmddSet.has(`${mm}-${dd}`);
  });

  // ── 2. Find memorial anniversary pets (memorial_at month+day in ±1 day window) ─
  const { data: memorialPets } = await supabase
    .from('pets')
    .select('id, name, species, emoji, owner_id, memorial_at, avatar_url, status')
    .eq('status', 'memorial')
    .not('memorial_at', 'is', null);

  const memorialMatches = (memorialPets ?? []).filter((p: any) => {
    if (!p.memorial_at) return false;
    const d = new Date(p.memorial_at);
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return mmddSet.has(`${mm}-${dd}`);
  });

  if (birthdayMatches.length === 0 && memorialMatches.length === 0) {
    return json({ success: true, sent: 0, reason: 'no matches today' });
  }

  // ── 3. Fetch a random photo for each pet ──────────────────────────────────
  const allPetIds = [
    ...birthdayMatches.map((p: any) => p.id),
    ...memorialMatches.map((p: any) => p.id),
  ];

  const { data: allPhotos } = await supabase
    .from('pet_photos')
    .select('pet_id, url')
    .in('pet_id', allPetIds);

  const photosByPet: Record<string, string[]> = {};
  for (const ph of (allPhotos ?? [])) {
    if (!photosByPet[ph.pet_id]) photosByPet[ph.pet_id] = [];
    photosByPet[ph.pet_id].push(ph.url);
  }

  function pickPhoto(pet: any): string | undefined {
    const photos = photosByPet[pet.id];
    if (photos && photos.length > 0) {
      return photos[Math.floor(Math.random() * photos.length)];
    }
    return pet.avatar_url ?? undefined;
  }

  // ── 4. Check which (pet, user, year) pairs already sent today ────────────
  // We use notification_logs with type='birthday_notif' or 'memorial_notif'
  // and a data->>'year' field to avoid resending on re-runs.
  const { data: sentToday } = await supabase
    .from('notification_logs')
    .select('user_id, data')
    .in('type', ['birthday_notif', 'memorial_notif'])
    .gte('created_at', `${thisYear}-01-01T00:00:00Z`);

  // Build set of "userId:petId:year" already sent
  const alreadySent = new Set<string>();
  for (const log of (sentToday ?? [])) {
    const d = log.data as any;
    if (d?.pet_id && d?.year) {
      alreadySent.add(`${log.user_id}:${d.pet_id}:${d.year}`);
    }
  }

  // ── 5. Per-user template dedup tracking ───────────────────────────────────
  // Track which template indices a user has already been assigned today
  const userBirthdayUsed  = new Map<string, Set<number>>(); // userId → Set<templateIdx>
  const userMemorialUsed  = new Map<string, Set<number>>();

  // Seed from existing notification_logs this year
  for (const log of (sentToday ?? [])) {
    const d = log.data as any;
    if (!d?.template_idx) continue;
    if (log.type === 'birthday_notif') {
      if (!userBirthdayUsed.has(log.user_id)) userBirthdayUsed.set(log.user_id, new Set());
      userBirthdayUsed.get(log.user_id)!.add(d.template_idx);
    } else if (log.type === 'memorial_notif') {
      if (!userMemorialUsed.has(log.user_id)) userMemorialUsed.set(log.user_id, new Set());
      userMemorialUsed.get(log.user_id)!.add(d.template_idx);
    }
  }

  // ── 6. Get all recipients: owners + ALL family roles (birthday/memorial is for everyone) ──
  const allPetIds = [...new Set([
    ...birthdayMatches.map((p: any) => p.id),
    ...memorialMatches.map((p: any) => p.id),
  ])];

  const ownerIds = [...new Set([
    ...birthdayMatches.map((p: any) => p.owner_id),
    ...memorialMatches.map((p: any) => p.owner_id),
  ])];

  // Owner + caretaker + caregiver share the milestone — viewer is read-only and excluded
  const { data: familyRows } = await supabase
    .from('pet_family')
    .select('pet_id, user_id')
    .in('pet_id', allPetIds)
    .in('role', ['caretaker', 'caregiver']);

  // Map petId → all recipient user IDs (owner + every family member)
  const recipientsByPet = new Map<string, Set<string>>();
  for (const petId of allPetIds) recipientsByPet.set(petId, new Set());
  for (const p of [...birthdayMatches, ...memorialMatches]) {
    recipientsByPet.get(p.id)?.add(p.owner_id);
  }
  for (const row of (familyRows ?? [])) {
    recipientsByPet.get(row.pet_id)?.add(row.user_id);
  }

  const allUserIds = [...new Set([...recipientsByPet.values()].flatMap(s => [...s]))];

  const [tokenRes, tzRes] = await Promise.all([
    supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', allUserIds)
      .like('token', 'ExponentPushToken%'),
    supabase
      .from('profiles')
      .select('id, timezone')
      .in('id', allUserIds),
  ]);

  const tokensByUser: Record<string, string[]> = {};
  for (const t of (tokenRes.data ?? [])) {
    if (!tokensByUser[t.user_id]) tokensByUser[t.user_id] = [];
    tokensByUser[t.user_id].push(t.token);
  }

  const userTzMap = new Map<string, string | null>(
    (tzRes.data ?? []).map((r: any) => [r.id, r.timezone ?? null])
  );

  // ── 7. Filter by notification preferences ────────────────────────────────
  const { allowed: allowedUsers } = await filterByPref(supabase, allUserIds, 'notif_daily');
  const allowedSet = new Set(allowedUsers);

  // ── 8. Build messages ─────────────────────────────────────────────────────

  const pushMessages: any[] = [];
  const logRows: any[] = [];

  // Helper: process one pet for all its eligible recipients
  // Each recipient gets their own per-user timezone + dedup + template check.
  function processPet(
    pet: any,
    type: 'birthday_notif' | 'memorial_notif',
    petMMDD: string, // "MM-DD" extracted from birthday or memorial_at
    templateVars: Record<string, string>,
    templatePool: Array<{ title: string; body: string }>,
    usedMap: Map<string, Set<number>>,
  ) {
    const recipients = [...(recipientsByPet.get(pet.id) ?? [])];
    const photo = pickPhoto(pet);

    for (const uid of recipients) {
      if (!allowedSet.has(uid)) continue;
      const tz = userTzMap.get(uid);
      // Per-user local date check — ensures UTC+/- users match on their calendar date.
      const userMMDD = localMMDD(tz);
      if (userMMDD !== petMMDD) continue;
      // Morning window gate (8–9 AM local). If no timezone stored, deliver anyway.
      if (tz !== undefined && tz !== null && !isMorningFor(tz)) continue;
      // Year-scoped dedup: use this user's local year to avoid cross-year boundary misses.
      const userYear = tz
        ? parseInt(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: tz }).format(now), 10)
        : thisYear;
      if (alreadySent.has(`${uid}:${pet.id}:${userYear}`)) continue;

      if (!usedMap.has(uid)) usedMap.set(uid, new Set());
      const usedIdxs = usedMap.get(uid)!;

      const tplIdx = pickTemplateIdx(usedIdxs, templatePool.length);
      usedIdxs.add(tplIdx);

      const { title, body } = fillTemplate(templatePool[tplIdx], templateVars);

      logRows.push({
        user_id: uid,
        title,
        body,
        type,
        data: { pet_id: pet.id, year: userYear, template_idx: tplIdx },
      });

      alreadySent.add(`${uid}:${pet.id}:${userYear}`);

      for (const token of (tokensByUser[uid] ?? [])) {
        const msg: any = {
          to: token, sound: 'default', title, body,
          data: { type, pet_id: pet.id },
          priority: 'high', channelId: 'reminders',
        };
        if (photo) msg.image = photo;
        pushMessages.push(msg);
      }
    }
  }

  // Birthday pets — per-user date/tz check happens inside processPet
  for (const pet of birthdayMatches) {
    const [, mm, dd] = pet.birthday.split('-');
    const age = ageFromBirthday(pet.birthday);
    processPet(
      pet, 'birthday_notif', `${mm}-${dd}`,
      { name: pet.name, age: age != null ? String(age) : 'another year', years: '' },
      BIRTHDAY_TEMPLATES,
      userBirthdayUsed,
    );
  }

  // Memorial anniversary pets — extract MM-DD from the date part only (no tz shift)
  for (const pet of memorialMatches) {
    // memorial_at may be a full timestamp or a date string; take the date portion directly.
    const datePart = (pet.memorial_at as string).slice(0, 10); // "YYYY-MM-DD"
    const [, mm, dd] = datePart.split('-');
    const yrs = yearsSince(pet.memorial_at);
    const yearWord = yrs === 1 ? 'year' : 'years';
    processPet(
      pet, 'memorial_notif', `${mm}-${dd}`,
      { name: pet.name, years: String(yrs), yearWord, age: '' },
      MEMORIAL_TEMPLATES,
      userMemorialUsed,
    );
  }

  // Always insert in-app logs regardless of push availability
  if (logRows.length > 0) {
    await supabase.from('notification_logs').insert(logRows);
  }

  if (pushMessages.length === 0) {
    return json({ success: true, sent: 0, birthday: birthdayMatches.length, memorial: memorialMatches.length });
  }

  // ── 9. Send to Expo in batches of 100 ────────────────────────────────────
  let sentCount = 0;
  for (let i = 0; i < pushMessages.length; i += 100) {
    const batch = pushMessages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (res.ok) {
        const result = await res.json();
        sentCount += (result.data ?? []).filter((d: any) => d.status === 'ok').length;
      } else {
        console.error('[birthday-memorial] Expo batch failed:', res.status);
      }
    } catch (err) {
      console.error('[birthday-memorial] fetch error:', err);
    }
  }

  return json({ success: true, sent: sentCount, birthday: birthdayMatches.length, memorial: memorialMatches.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
