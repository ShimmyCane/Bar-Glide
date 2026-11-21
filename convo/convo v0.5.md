# Ole Bar Glide — convo v0.5 (2026-11-21)

## Jimmy's answers to v0.4 (summary)
- One door on the left; guests fan out to the bars.
- A guest walking to a bar can't take a drink until they reach it.
- A guest can have as many beers as they like, as long as they finish the last one. Wants a ⚙️ slider for how fast empties come back.
- Build every bonus event described, with a ⚙️ frequency slider and some variability.
- Fight: guests are escorted out, no penalty to the player.

## What Claude did (0.4.0)
- **One saloon door** at the top left, a walkway down the left side, guests turn onto their bar. Mugs only catch guests who are at a bar.
- **X2 rewritten:** serve, drink, empty returns, X2 goes away, next beer, then the guest leaves down the walkway (+50). A beer that reaches a guest who is still drinking slides past.
- **Bonus events** (about 8-15 s each, uneven gaps, never twice in a row): drunk dancer (4 dance styles, wobbles and falls off the bar), bar fight (3 styles, a bouncer escorts the fighters and that bar's guests out, no penalty), celebration (3 styles), helper on a break (3 helpers, clears one or two bars and catches empties).
- **⚙️ sliders:** "Empty glasses coming back" (slower to faster) and "Bonus events" (Off, Rare, Sometimes, Often, Lots). Events start at Sometimes; the first one needs about 12 s of play.

## Questions for Jimmy (answer inline)
1. Do the events start too early or too often at Sometimes? Should they start in Lunch rather than Morning?
   > 
2. Fight: the escorted guests leave without score. Should they count towards finishing the shift, or should the shift wait for new guests?
   > 
3. Helper: it earns +10 per empty it catches. Fine, or should it earn nothing?
   > 
4. Should the sound lab sounds replace the game's sounds yet (open from convo v0.3)?
   > 
