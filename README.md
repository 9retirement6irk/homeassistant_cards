# Fragrance Cards

Dashboard cards for Pura diffusers, Scentsy warmers and a fragrance stash kept in Home Assistant todo lists.

They're built like the built-in tile card and draw their surfaces from your theme, so they sit next to your other cards. Buttons, sliders and pod wells get a little gloss and depth; turn it off per card with `gloss: false`.

| Card | What it shows |
| --- | --- |
| `custom:pura-mini-card` | One Pura diffuser: each pod with its picture and level, an intensity slider, power, auto-alternate and nightlight. |
| `custom:room-fragrance-card` | A room's fragrance as a stack of tiles: today's pick, Pura, the Scentsy bar and warmers, and any extra tiles (like a candle warmer lamp). |
| `custom:fragrance-picks-card` | Today's suggested scent for each room, with Start, the reason and the runner-ups. |
| `custom:fragrance-loaded-card` | What's loaded in each room: Pura pods with pictures and levels, and the Scentsy bar. |
| `custom:fragrance-stash-card` | What's on the shelf: totals, a by-family breakdown and what's running low. Read-only. |
| `custom:fragrance-inventory-card` | Manage the lists: search, filter by family, change counts, rate, mark one used up, add new scents. |
| `custom:wear-pick-card` | What perfume to wear today and tonight, with the bottle's picture, Wearing it, thumbs and stars. |
| `custom:perfume-collection-card` | Your perfume bottles as a shelf of pictures: Parfumo notes, accords, longevity and season votes, ratings, add and finish bottles. |

## Install

### Marketplace / HACS

1. Settings > Marketplace (HACS on older versions) > ⋮ > **Custom repositories**.
2. Add `https://github.com/9retirement6irk/homeassistant_cards` with the type **Dashboard** (Lovelace / plugin).
3. Open **Fragrance Cards** and download it. The dashboard resource is added for you.
4. Refresh your browser.

### Manual

Copy `dist/fragrance-cards.js` to `/config/www/`, then add `/local/fragrance-cards.js` as a JavaScript module under Settings > Dashboards > ⋮ > Resources.

Every card has a visual editor. The YAML below shows every option.

## Pura Mini

Needs the [Pura integration](https://github.com/natekspencer/ha-pura). The card finds the diffuser's entities by itself, so renamed entities keep working.

```yaml
type: custom:pura-mini-card
device_id: 3db7f956aae6c0ffb4f238c432ad2e18
name: Main Room            # default: the device name
icon: mdi:scent
color: teal                # accent; a theme color name or any CSS color
show_intensity: true
show_auto_alternate: true
show_nightlight: true
show_power: true           # off: power turns the diffuser off; on: starts the fullest pod
show_pod_images: true      # Pura's pod pictures; a drawn pod when there's none
compact_when_off: true     # hide the slider and toggles while it's off
low_threshold: 20          # % at which a pod shows red
gloss: true
```

Tap a pod to start it, tap the running pod to stop. Tap the icon for the diffuser's details.

## Room Fragrance

```yaml
type: custom:room-fragrance-card
title: Fragrance
title_icon: mdi:scent

# Today's pick
suggestion_entity: input_text.scent_suggestion_main_room
scores_entity: input_text.scent_scores_main_room      # "Name 68 · Name 66 · ..."
refresh_entity: input_button.refresh_scent_suggestions
show_suggestion: true
show_scores: true
feedback_script: script.scent_feedback   # 👍 / 👎 on today's pick
pura_list: todo.pura_pods                # ⭐ rates the pick on its list
scentsy_list: todo.scentsy_bars
room_name: Main Room                     # sent with votes; default comes from the suggestion entity

# Pura (same options as Pura Mini)
pura_device_id: 3db7f956aae6c0ffb4f238c432ad2e18
pura_name: Pura
show_pura: true

# Scentsy
scentsy_entity: input_select.main_room_scentsy_bar
scentsy_name: Scentsy bar
scentsy_color: purple
warmers:
  - switch.kitchen_scentsy
  - entity: switch.tv_stand_scentsy
    name: TV Stand
    icon: mdi:candle
warmer_columns: 4
show_scentsy: true

# Extra tiles under the card; dimmable lights get a brightness slider
entities:
  - light.candle_warmer_lamp
gloss: true
```

The suggestion is read from text like:

- `Pura: slot 1 Simmered Cider, medium (68) — juicy apple, clove and bourbon…`
- `Scentsy: Stargazing (65) — soft vanilla clouds…`

**Start it** starts that Pura slot and sets the intensity, or picks that Scentsy bar and turns the warmers on. With the lists set, the ⭐ button opens a 1–5 star rating for the pick, written to its `Stars:` line; Fragrance Picks has the same button.

## Stash and Inventory

Both read todo lists where each item is one scent and its description holds `Key: value` lines:

```text
Brand: Otherland
Category: Fresh
Pods: 2
Pod level: 60%
Stars: 5/5
Notes: Top: champagne; Middle: saffron; Base: leather
Feels: Effervescent, indulgent, romantic
Last used: 2026-11-21
```

`Category` groups scents into families, and `Car refills` or `Bricks` lines count as "only … left" when the main count is 0. Inventory edits only the lines it changes and leaves everything else in the description alone.

```yaml
type: custom:fragrance-stash-card
title: Stash
pura_list: todo.pura_pods
scentsy_list: todo.scentsy_bars
pura_count_key: Pods
scentsy_count_key: Bars
pura_color: teal
scentsy_color: purple
manage_path: /lovelace/fragrance   # where the Manage button goes
show_totals: true
show_families: true
show_low: true
low_threshold: 0.75   # less than this many left; an open pod at 52% counts as 0.52
max_low: 6
```

```yaml
type: custom:fragrance-inventory-card
title: Inventory
pura_list: todo.pura_pods
scentsy_list: todo.scentsy_bars
pura_count_key: Pods
pura_level_key: Pod level
scentsy_count_key: Bars
show_search: true
show_families: true
show_add: true
sort: family          # family | name | count | stars
max_items: 50
```

**Used one up** lowers the count and resets an open pod's level to 100% for the next one. When the last one is used and there are no car refills or bricks left, the item is checked off the list.

## Theme notes

Cards render inside `ha-card`, so a theme's card background, border and radius apply. Accent colors accept theme color names (`teal`, `purple`, `amber`…) or any CSS color.

## Fragrance Picks

Today's suggested scent for each room, from the same suggestion text as Room Fragrance. **Start** starts it (Pura slot and intensity, or Scentsy bar and warmers), **On now** shows when it's already running, and **Regenerate** presses your refresh button after a second tap. The gear in the header opens the settings listed under `tuning`: number sliders, on/off switches (automations, input booleans) and pickers.

With `feedback_script` set, each pick gets a thumbs up and down. A tap runs that script with `scent`, `target_list`, `vote` (`up` or `down`) and `room`, so your suggestion logic can learn from it. The card remembers your vote in this browser so a pick isn't voted twice.

```yaml
type: custom:fragrance-picks-card
title: Whole home
icon: mdi:home-heart
summary_entity: input_text.scent_suggestion_whole_home
refresh_entity: input_button.refresh_scent_suggestions
show_updated: true
show_reason: true      # tap the reason to expand it
show_scores: true      # runner-ups as chips
max_scores: 4
show_start: true
tuning:                # shown behind the gear in the header
  - input_number.scent_exploration
  - entity: input_number.scent_use_it_up
    name: Use it up
    icon: mdi:delete-sweep-outline
    color: orange
  - automation.scent_daily_suggestions
feedback_script: script.scent_feedback   # adds 👍 / 👎 to each pick
pura_list: todo.pura_pods                # which list a Pura pick's vote goes to
scentsy_list: todo.scentsy_bars
rooms:
  - name: Main Room
    icon: mdi:sofa
    suggestion_entity: input_text.scent_suggestion_main_room
    scores_entity: input_text.scent_scores_main_room
    pura_device_id: 3db7f956aae6c0ffb4f238c432ad2e18
    scentsy_entity: input_select.main_room_scentsy_bar
    warmers: [switch.kitchen_scentsy, switch.buffet_scentsy]
    navigation_path: /lovelace/main
```

## Fragrance Loaded

What's in each room right now: each Pura pod with its picture and level (the running one glows), and the Scentsy bar.

```yaml
type: custom:fragrance-loaded-card
title: Loaded now
show_header: true
show_pod_images: true
show_scentsy: true
low_threshold: 30        # % shown in red text
critical_threshold: 15   # % where the room icon and bar turn red
rooms:
  - name: Main Room
    icon: mdi:sofa
    pura_device_id: 3db7f956aae6c0ffb4f238c432ad2e18
    scentsy_entity: input_select.main_room_scentsy_bar
    warmers: [switch.kitchen_scentsy]
    navigation_path: /lovelace/main
```

## Perfumes you wear

Two cards for a personal perfume collection kept in one todo list, one item per bottle. They read the same `Key: value` lines as the stash cards, plus a few from Parfumo:

```text
Brand: Demeter Fragrance Library
Parfumo: https://www.parfumo.com/Perfumes/Demeter_Fragrance_Library/Dirt
Image: https://media.parfumo.com/perfumes/…/dirt_1200.jpg
Accords: Earthy, Woody, Green
Notes: Green notes, Moss, Woods
Parfumo score: 6.5/10
Longevity: 4.6/10
Sillage: 4.2/10
Season votes: Fall 35%, Spring 30%, Summer 20%, Winter 15%
Occasion votes: Daily 40%, Leisure 30%, Business 10%
Size: 4 oz
Season: fall, winter          # your own tags
Suggestions: not for the office   # your own rule
Stars: 4/5
Last used: 2026-11-20
Liked: 2
```

`Image` is shown as the bottle's picture, loaded straight from Parfumo's image server; without it the cards draw a bottle. An item with no `Parfumo` line shows **Looking up…**, and `Parfumo: not found` shows a box to paste the right Parfumo link.

### What to Wear

The day and evening picks from text like `Demeter Dirt (64) — earthy moss for a cool day 🌿`. Each shows the bottle, its main accords and longevity, the reason (tap to expand), **Wearing it**, 👍 / 👎 and a star rating. Runner-ups from the scores entity are listed under **Also good**; tapping one marks it worn instead. **New pick** presses the refresh button after a second tap.

```yaml
type: custom:wear-pick-card
title: What to wear
list: todo.fragrances
day_entity: input_text.wear_suggestion_day
evening_entity: input_text.wear_suggestion_evening
scores_entity: input_text.wear_scores            # "Name 64 · Name 50 · ..."
refresh_entity: input_button.refresh_wear_suggestion
feedback_script: script.fragrance_feedback       # runs with vote (wear, up, down) and scent
show_images: true
show_details: true          # accords, longevity, stars
show_scores: true
max_scores: 4
evening_today_only: true    # hide yesterday's evening pick
color: deep-purple
```

Without `feedback_script`, **Wearing it** writes `Last used` on the item itself and the thumbs are hidden.

### Perfume Collection

A shelf of bottle pictures with search and a chip per main accord. Tap a bottle for its notes, accords, Parfumo score, longevity and sillage, the season votes as bars and the top occasions, plus **Wearing it**, a link to Parfumo, **Refresh** (runs the lookup script again) and **Finished it** (two taps; checks it off). Finished bottles move to their own tab, where **Back on the shelf** restores them. **+ Add** adds a bottle by name with an optional size; your lookup automation fills in the rest.

```yaml
type: custom:perfume-collection-card
title: Collection
list: todo.fragrances
feedback_script: script.fragrance_feedback
lookup_script: script.fragrance_parfumo_lookup   # called with scent: <name>
show_images: true
show_search: true
show_families: true     # chips by main accord
show_add: true
show_finished: true
sort: name              # name | stars | worn | family
tile_width: 104         # px; tiles fill the row
max_items: 60
color: deep-purple
```

