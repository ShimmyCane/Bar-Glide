# Bar Glide — todo

## Waiting on Jimmy
- [x] Name: Ole Bar Glide (0.3.0).
- [ ] Answer convo v0.3.
- [ ] Paste the SQL (test → 001 → verify) and send back the verify table.
- [ ] Play it on the iPad and leave notes in ⚙️.

## Ideas (from the genre; pick after the first play)
- [x] Tips left on the bar and a show that distracts the customers (0.2.0).
- [x] Bonus round between rounds: find the coin under the mugs (0.2.0).
- [ ] More rooms: sports bar, space bar, a pastel ice-cream parlour (root beer floats) for the kids.
- [x] Shifts: Morning tutorial with 2 bars, Lunch, Afternoon, Dinner, Night (0.3.0).
- [x] Two-drink orders; forgiving edge catch (0.3.0).
- [x] Sound lab page (0.3.0).
- [ ] Cut-off customers or jokers you must not serve (Jimmy thinking).
- [ ] Use sounds saved in the Sound lab inside the game.
- [ ] Bigger customers on a phone.
- [x] Music loop (Web Audio), toggle in ⚙️ (0.2.0).
- [ ] A second tune for later rounds; a jukebox you can tap.
- [ ] A real iPad check of the hold-to-pour gesture (long-press menus, double-tap zoom).

## Notes round 2026-11-21 (4 open notes read from bglide_notes; see convo v0.4)
- [ ] Guests start at the saloon door: appear at the door, push through a single door, then walk to one of the bars. Only guests who have reached a bar can take a drink. (notes of 11-10 and 11-16; current code spawns each guest at x=-14 behind its own lane doorway, so not built)
- [ ] X2 bug: with an early beer the X2 sign sometimes fails. A guest should drink one, send the mug back, lose the X2 sign, drink the second, then leave (shown walking down-screen for now). (needs a repro; the code keeps `wants` and `extra`, so the sign logic is the first suspect)
- [ ] Bonus events (new feature, off by default, ⚙️ switch plus a frequency slider; about 15 s each, several dance and fight variants): Drunk dancer (everyone watches, time bought), Bar fight (bouncer throws them out, that bar's guests reset), Celebration (a pause to serve), Break (a helper clears one or more bars).
- Score read: 1 saved score (JIM, round 8, v0.3.0). Tables are live in the Family project.
