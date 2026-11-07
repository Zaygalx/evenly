# Demo video plan, Evenly (75 to 90 seconds)

Design first. Nothing has been rendered. See the end for what Muse can
render, what it costs, and what only the user can shoot.

## The story in one line

Two roommates are mid argument about money neither of them can prove.
Evenly ends it in five seconds, because Evenly remembers everything.

## 1. Visual style direction

Palette, straight from the app:
- Deep green #0e7a5f as the hero colour. It means settled, remembered, calm.
- Warm off white #faf8f3 as the base. Kitchens and receipts, not fintech blue.
- Soft apricot #f0a868 as the single accent. Arguments, warnings, the one correction.
- Red appears once, for the word "No" in the opening argument. Nowhere else.

Typography:
- Inter for everything, tabular numbers for money so digits never wobble.
- On screen text is short, large, and lands word by word on the beat.
- Blob ids and transaction digests in a mono font, small, like print on a receipt.

Motion language:
- Fast cuts during the argument (half second shots, handheld energy).
- Slow pushes and gentle zooms on every app screen. The app is the calm one in the room.
- Text hits on musical beats for the three claims: It remembers. It learns. It proves.
- Transitions are hard cuts on beats, plus one match cut: a paper receipt slapped on a table becomes the app's memory card on screen.

Signature visual idea: The Learning Bar.
Every purchase carries one green bar showing the split. At the start it sits
at 50 50. The moment the split is corrected, the bar visibly slides to the
learned ratio and a small receipt stamp lands on it: REMEMBERED, plus the
blob id. The bar returns at the end, now splitting instantly at the learned
ratio with no sliding at all. The audience watches the app learn, in one
shape, three times.

## 2. Storyline and shot list (target 85 seconds)

Total voiceover is about 190 words, a natural pace for 85 seconds.

| Time | Shot | On screen text | Voiceover |
| --- | --- | --- | --- |
| 0:00 to 0:03 | Black. Two voices raised, mid argument, shot of a kitchen table, receipts everywhere. Text slams in word by word. | "I paid yesterday." "No. You. Did. Not." | (No voiceover. Argument audio only.) |
| 0:03 to 0:08 | Freeze on the angriest face. Record scratch energy. Cut to the phone on the table, Evenly open, calm green. | The argument ends here. | "Every house share fight is the same fight. Nobody can prove anything." |
| 0:08 to 0:18 | Live app: one line typed into the log bar, "groceries 4200 paid by Adaeze". The purchase lands in the list. Learning Bar sits at 50 50. Small label, bottom corner: Agent test households. | One line. That is the whole chore. | "So I built Evenly. You log a purchase in one line, the way you would text a friend, and it is remembered. Properly remembered." |
| 0:18 to 0:30 | The proposal appears with its Why panel open, memory citations visible. A hand taps Correct and sets 70 30. The Learning Bar slides. The REMEMBERED stamp lands with the blob id. | Correct it once. | "Evenly proposes the split from your household's own memory, and shows its working. Wrong? Correct it once." |
| 0:30 to 0:42 | Second groceries purchase typed. Proposal arrives already at 70 30. Accept tapped instantly. The bar does not slide. Learning chart rises. | It never asks twice. | "Next time, it proposes your split straight away. It learned. The chart is just the receipts of it learning." |
| 0:42 to 0:55 | Balances screen, then the settlement. A wallet sends USDC. Beat. The settlement flips to Settled with the transaction digest. | Settled means settled. | "When it is time to pay up, Evenly does the maths and watches the chain. Your flatmate pays from their own wallet, and the app sees it and marks it Settled. No screenshots. No trust me." |
| 0:55 to 1:08 | The restart proof page. Finger hovers, taps Wipe local state and rebuild. A held breath. The household rebuilds, report card: balances identical. | Delete everything. It rebuilds. | "And if the server forgets everything? One button wipes it all, and the household rebuilds from its memories alone. The memory is the database." |
| 1:08 to 1:20 | Back to the kitchen, same table, calm now. One roommate shows the other the phone. The chart. A shrug, a laugh. | Five seconds. Argument over. | "So the next argument lasts five seconds. The receipts argue. The roommates do not have to." |
| 1:20 to 1:25 | End card on off white: logo, name, live URL. Learning Bar one last time, splitting instantly. | Evenly. It remembers, so you do not have to fight about it. | "Evenly. Built on Walrus Memory and Tatum." |

## 3. Sound direction

Music: warm, light, confident. Acoustic guitar or marimba over a soft beat,
95 to 105 BPM, no lyrics, nothing corporate. It ducks under the voiceover
and lifts in the gaps at 0:30 and 1:08.
Royalty free sources, licences checked by name:
- Pixabay Music (pixabay.com/music): Pixabay Content Licence, free for
  commercial use, no attribution required. Search "warm acoustic upbeat".
- Uppbeat (uppbeat.io): free plan is licensed for creators with an
  attribution credit in the video description.
- Kevin MacLeod at incompetech.com: Creative Commons CC BY 4.0, attribution
  line required in the description.

Sound effects, all from Pixabay Sound Effects under the same licence:
- The log: a soft paper receipt tap, one dry click as the purchase lands.
- The proposal appearing: a two note chime, gentle, like a polite tap on the shoulder.
- The correction: a short pencil scratch as the bar slides.
- The Settled flip: a coin softened by a stamp thud. This is the money shot, keep it warm, not casino.
- The rebuild: a rising soft whoosh into one clean chime when balances match.

Silence: two deliberate drops.
- At 0:55, just before the wipe tap, music and effects cut out completely
  for one full second. The risk needs to be felt.
- At 1:08, half a second of quiet before the laugh. Let the relief land.

## 4. Screen capture plan from the live site

Record on your phone, in this order, from the live site
https://evenly-gamma-three.vercel.app (Safari, notifications off, Do Not
Disturb on, brightness up, 1080p screen recording):

1. Landing page: slow scroll through the hero and the Example card. (5 seconds of footage is plenty.)
2. Open agent test household 1, Night Owls. Overview: pause on the balances card and the log bar.
3. Type "groceries 3600 paid by Adaeze" in the log bar. Let the parsed preview show, submit, and hold on the proposal with the Why panel open.
4. Open the Memory view: scroll the timeline slowly so blob ids pass the camera. Find the groceries correction and hold on it.
5. Open the learning chart and hold for three seconds.
6. Open the Settle view: hold on the Settled settlement (Chidi to Adaeze, 0.37 USDC) with its transaction digest visible.
7. Open the proof page for this household (the Restart proof link, or /proof/113aa5c1-53e2-4834-855e-243aa7d25d58), tap the wipe and rebuild button, and record the full rebuild until the result card shows balances identical.
8. Open the Honest limits page and scroll it once, slowly. One second of it in the edit sells the honesty beat.
9. Kitchen shots are yours to film: two people, one table, receipts, 10 seconds of arguing and 5 seconds of the calm replay. Faces are optional; hands and the phone work fine and cut faster.

Keep every raw clip. The edit needs options more than it needs perfection.

## 5. Honest framing

- Any screen showing agent test data carries a small lower third label for
  its whole appearance: "Agent test households". The Night Owls screens are
  agent test data and get the label. Your own fresh household, if you make
  one for the demo, does not need it.
- No user numbers are claimed anywhere in the script, because there are
  none to claim yet. Real households: zero so far, and the script says
  nothing that suggests otherwise.
- Every number spoken is from the verified report: 150 memories in the
  first run, 6 of 6 settlements detected, one correction to learn a split.
- The Settled flip shown is a real detected settlement with its real
  digest, not a mock animation.

## Can Muse render this?

Partly, and here is the honest split:
- Muse can assemble a product cut on this machine today: the app screens
  as motion clips, the Learning Bar animation, text hits, end card, a
  generated voiceover, and licensed music laid under it, all with ffmpeg.
  Estimated cost: about +2 to 3 percent of the weekly credit limit.
- Muse cannot film the kitchen argument. That needs your phone and two
  humans, or the video opens on text and sound alone, which works but is
  weaker.
- Recommended path: you shoot the kitchen beats and the screen captures
  (plan above), Muse builds everything else and assembles a first full
  cut for your approval. Nothing renders until you approve this plan.

## Addendum: two fact cards for the render (added during production)

The Settle scene in the rendered cut is a designed fact card, not app
footage: a real detected settlement, Chidi to Adaeze 0.37 USDC, digest
B3eqxfhVy5STuvnKTYLfh3xkrpxHoZjMgsFnYFb5KkMo, 6 of 6 settlements detected
through Tatum. The restart proof scene is also a fact card with the live
verification numbers from 7 Nov 2026: storage mode Walrus Memory (Mainnet),
memories found 40, expenses 12 before and 12 after, settlements 1 and 1,
balances identical after rebuild. Both cards are statements of verified
facts, labelled as verified on the live site.

## Production note, v1 render (7 Nov 2026)

Built and rendered by Muse after the user approved: evenly-demo-v1,
62 seconds, 1080p. Structure follows this plan with two deviations, both
honest ones. The plan targeted 75 to 90 seconds; the voiceover timed at
62 seconds total, and the cut was kept tight rather than padded. And the
household footage comes from the production build running locally with a
demo household, because live site capture to files is blocked from the
build machine; those shots carry an on screen label, and the settlement
and restart proof beats are fact cards with the verified live numbers
rather than footage. Replacing the demo shots with phone captures from
the live site (capture plan above) is a drop in edit. A soft synthesized
pad sits under the voiceover instead of licensed music in v1; the music
sources above remain the plan for the final cut.

## Production note, v2 (7 Nov 2026)

The user generated the kitchen argument clip themselves with Higgsfield
from a prompt Muse supplied, and sent the 4 second clip back. It now
opens the video: receipts, argument, phone shown, laughter. Muse cut the
text only hook from v1 and joined the clip to the front of the product
cut, keeping the clip's own audio under the opening and the voiceover
after. Result: evenly-demo-v2, 63 seconds, 1080p. The demo video URL for
the submission form still needs a hosted link; upload this file wherever
the form expects (YouTube, Loom or Drive) and use that URL.
