# Ancients Hunters Encounter NPCs

A referee compendium for Twodsix on Foundry VTT. It includes **32 Trivial Characters and one native Twodsix Animal**.

- Three members each for The Pride, Deck Nine Compact, Quiet Relay, The Chorus, The Outboarders, and Ward Seven, with primary Areas of Competence at +1, +2, and +3.
- Encounter NPCs across Affinity Station, Leystroak, Crompton, and Effinity. The Crompton group includes two warden roles and the ridge cat.
- Equipment, encounter cues, and unlinked prototype tokens for repeated scene placement.

## Install

1. In Foundry Setup open **Add-on Modules → Install Module** and paste the [companion manifest](https://github.com/GuinivereJane/twodsix-ancients-hunters/releases/latest/download/module.json).
2. Accept the prompt to install [Trivial Characters for Twodsix](https://github.com/GuinivereJane/twodsix-trivial-characters/releases/latest/download/module.json) if needed. This module uses its compact character sheet.
3. In your Twodsix world, open **Manage Modules** and enable **Ancients Hunters Encounter NPCs** and **Trivial Characters for Twodsix**.
4. Open **Ancients Hunters Encounters** in the Compendium sidebar. For the Crompton patrol, place one Lead Warden and three copies of the Reserve Warden.

Verified on Foundry VTT 14.370 with Twodsix 7.5.2. Encounter cues are written for the referee.

## Build from source

Run `npm ci`, `npm run build`, and `npm run check:pack` with Node.js 22.13 or newer. The builder checks the compiled Actor compendium against its JSON source. Runtime files live in `twodsix-ancients-hunters/`.
