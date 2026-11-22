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

**Start it** starts that Pura slot and sets the intensity, or picks that Scentsy bar and turns the warmers on.

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
