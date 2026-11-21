/* Ole Bar Glide — version and database settings.
 * Publishable key only: safe in browser code, protected by row-level security.
 * Never put a service-role or secret key in this file or anywhere in the repo. */
window.BG = window.BG || {};
window.BG.VERSION = '0.5.0';
window.BG.CHANGES = [
  '0.5.0 · Modern look: smooth vector people, glass mugs with foam, a polished panelled bar, glowing lamps and neon, a carpeted walkway, soft shadows and rounded labels. Bonus events now start at Lunch; guests escorted out of a fight do not count towards the shift. The pixel original is kept as Version 1 (⚙️ → Pages).',
  '0.4.0 · One saloon door: guests step in, walk down to a bar and only take a drink once they are at it. X2 fixed: a guest finishes one beer, hands back the empty, loses the X2 and comes for the next, then leaves. Bonus events: drunk dancer, bar fight with a bouncer, celebration, a helper on a break (⚙️ slider Off to Lots). New ⚙️ slider for how fast empties come back.',
  '0.3.0 · Renamed Ole Bar Glide. A day of shifts: Morning (2 slow bars, 30 easy seconds), Lunch rush, Afternoon (3 bars), Dinner rush (4 bars), Night, then faster nights. Some customers order two (X2). An empty mug wobbles on the edge for a quarter second before it falls, and is caught a tenth of a second early. 🎛️ Sound lab page in ⚙️ → Pages.',
  '0.2.0 · More energy: a looping honky-tonk tune that speeds up each round (🎵 in ⚙️), the neon sign pulses to the beat. Tips: tap a coin to dash for it, +150 and SHOW TIME (spotlights, everyone stops to watch). Bonus round after every second round: find the coin under the mugs.',
  '0.1.0 · First pour: 4 bars (3 for a quick game), customers in steps, sliding mugs, empties to catch, breaks with an uh-oh, the owner’s ending, ⚙️ with notes, scores and the family database.'
];
window.BG.DB = {
  url: 'https://twvqvutrcobedvuhnzxq.supabase.co',
  key: 'sb_publishable_eqUo8HEdEB1hMQM4CpSVqA_9i6b0qCo',
  tables: ['bglide_scores', 'bglide_notes']
};
