import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compilePack, extractPack} from "@foundryvtt/foundryvtt-cli";

const root = fileURLToPath(new URL("../", import.meta.url));
const sheetModuleId = "twodsix-trivial-characters";
const campaignModuleId = "twodsix-ancients-hunters";
const iconRoot = "systems/twodsix/assets/icons";
const buildVersions = {coreVersion: "14.370", systemId: "twodsix", systemVersion: "7.5.2"};
const levels = [1, 2, 3];
const physical = ["strength", "dexterity", "endurance"];
const ownerHover = 20;

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requireText(value, name) {
  assert.equal(typeof value, "string", name);
  assert.ok(value.trim().length, name);
}

function makeFolder(stableId, key, name, index) {
  const id = stableId("folder:" + key);
  return {
    _id: id,
    _key: "!folders!" + id,
    name,
    type: "Actor",
    sorting: "a",
    sort: index * 100000,
    folder: null,
    _stats: buildVersions
  };
}

function makeItem(stableId, catalogueKey, actorId, key, gear, index) {
  const id = stableId("item:" + catalogueKey + ":" + key);
  return {
    _id: id,
    _key: "!actors.items!" + actorId + "." + id,
    name: gear.name,
    type: gear.type,
    img: iconRoot + "/" + gear.icon,
    system: gear.system ?? {},
    effects: [],
    sort: index * 100000,
    _stats: buildVersions
  };
}

function makeActor(stableId, actor) {
  const {catalogueKey, name, tokenName, folderId, icon, characteristics, gear, profile} = actor;
  const id = stableId("actor:" + catalogueKey);
  const img = iconRoot + "/" + icon;
  const hits = characteristics.reduce((sum, score) => sum + score, 0);
  return {
    _id: id,
    _key: "!actors!" + id,
    name,
    type: "traveller",
    folder: folderId,
    img,
    system: {
      characteristics: Object.fromEntries(physical.map((key, index) => [
        key, {value: characteristics[index], damage: 0}
      ])),
      hits: {value: hits, max: hits, min: 0, lastDelta: 0}
    },
    prototypeToken: {
      name: tokenName,
      texture: {src: img},
      actorLink: false,
      appendNumber: true,
      disposition: 0,
      displayName: ownerHover,
      displayBars: ownerHover,
      bar1: {attribute: "hits"}
    },
    items: gear.map(([key, item], index) => makeItem(stableId, catalogueKey, id, key, item, index)),
    effects: [],
    ownership: {default: 0},
    flags: {
      core: {sheetClass: sheetModuleId + ".TrivialCharacterSheet"},
      [sheetModuleId]: {profile}
    },
    _stats: buildVersions
  };
}

function makeAnimal(stableId, actor, record) {
  const animal = record.animal;
  actor.type = "animal";
  actor.flags = {[campaignModuleId]: {source: record.source}};
  Object.assign(actor.system, {
    description: "<p>" + record.cue + "</p>",
    species: animal.species,
    animalType: {niche: "carnivore", subtype: "pouncer"},
    homeWorld: animal.homeWorld,
    numberAppearing: "1",
    primaryArmor: {value: animal.protection}
  });
  actor.system.characteristics.lifeblood = {value: actor.system.hits.value, damage: 0};
  actor.prototypeToken.disposition = -1;
  const skill = makeItem(stableId, record.key, actor._id, "natural-weapons", {
    name: record.primary.label,
    type: "skills",
    icon: "melee-combat-natural-weapons.svg",
    system: {value: record.level, characteristic: "NONE"}
  }, actor.items.length);
  actor.items.push(skill);
  const weapon = actor.items.find(item => item.type === "weapon");
  weapon.system = {...weapon.system, skill: skill._id, associatedSkillName: skill.name};
  return actor;
}

async function checkPack(pack, extraction, documents) {
  await extractPack(pack, extraction);
  const entries = await readdir(extraction);
  const actual = await Promise.all(entries.map(name => readJson(join(extraction, name))));
  const byKey = entries => new Map(entries.map(entry => [entry._key, entry]));
  assert.equal(actual.length, documents.length, "Extracted document count");
  assert.deepEqual(byKey(actual), byKey(documents), "Actor, Folder, embedded Item and flag round trip");
}

async function publishPack(packPath, stage, compiled) {
  const previous = join(stage, "previous");
  let hadPrevious = false;
  try {
    await rename(packPath, previous);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await rename(compiled, packPath);
  } catch (error) {
    if (hadPrevious) await rename(previous, packPath);
    throw error;
  }
}

async function campaignCatalogue(stableId) {
  const [gangs, encounters, baseGear, campaignGear] = await Promise.all([
    readJson(join(root, "content", "ancients-gangs.json")),
    readJson(join(root, "content", "ancients-encounters.json")),
    readJson(join(root, "content", "gear.json")),
    readJson(join(root, "content", "ancients-gear.json"))
  ]);
  const expectedGangs = ["Deck Nine Compact", "Quiet Relay", "The Chorus", "The Outboarders", "The Pride", "Ward Seven"];
  assert.deepEqual([...new Set(gangs.map(gang => gang.folder))].sort(), expectedGangs);
  for (const folder of expectedGangs) {
    assert.deepEqual(gangs.filter(gang => gang.folder === folder).map(gang => gang.level).sort(), levels, folder);
  }
  const gearBook = {...baseGear, ...campaignGear};
  const all = [...gangs, ...encounters];
  const folders = [...new Set(all.map(record => record.folder))];
  const folderDocs = folders.map((name, index) => makeFolder(stableId, name, name, index));
  const folderIds = new Map(folderDocs.map(folder => [folder.name, folder._id]));

  const actors = all.map(record => {
    const {key, name, folder, icon, characteristics, primary, secondary, level, cue, source} = record;
    for (const value of [key, name, folder, icon, cue, source, primary?.label, primary?.scope]) requireText(value, key);
    assert.match(key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, name);
    assert.equal(characteristics.length, 3, name);
    assert.ok(characteristics.every(score => Number.isInteger(score) && score > 0), name);
    assert.ok(Number.isInteger(level) && level >= 0 && level <= 6, name);
    const primaryAocId = stableId("aoc:" + key + ":primary");
    const aocs = {[primaryAocId]: {...primary, dm: level}};
    if (secondary) {
      requireText(secondary.label, name);
      requireText(secondary.scope, name);
      assert.ok(Number.isInteger(secondary.dm) && secondary.dm >= 0 && secondary.dm <= 6, name);
      aocs[stableId("aoc:" + key + ":secondary")] = secondary;
    }
    const uniqueGear = new Set(record.gear);
    assert.equal(uniqueGear.size, record.gear.length, name);
    const gear = record.gear.map(itemKey => {
      assert.ok(Object.hasOwn(gearBook, itemKey), name + ": " + itemKey);
      return [itemKey, gearBook[itemKey]];
    });
    for (const item of record.equipment ?? []) {
      requireText(item, name);
      gear.push(["equipment:" + item, {name: item, type: "equipment", icon: "backpack.svg"}]);
    }
    assert.equal(new Set(gear.map(([key]) => key)).size, gear.length, name + " distinct gear");
    const profile = {schemaVersion: 1, role: record.role ?? folder, cue, primaryAocId, aocs, catalogueKey: key, source};
    const actor = makeActor(stableId, {
      catalogueKey: key, name, tokenName: record.tokenName ?? name, folderId: folderIds.get(folder),
      icon, characteristics, gear, profile
    });
    return record.animal ? makeAnimal(stableId, actor, record) : actor;
  });
  return {folderDocs, actors};
}

async function build({check}) {
  const moduleId = campaignModuleId;
  const manifest = await readJson(join(root, moduleId, "module.json"));
  const pack = manifest.packs[0];
  const packRoot = join(root, moduleId, "packs");
  const packPath = join(root, moduleId, pack.path);
  const buildLock = join(packRoot, ".build-lock");
  const stableId = key => createHash("sha256").update(moduleId + ":" + key).digest("hex").slice(0, 16);
  const {folderDocs, actors} = await campaignCatalogue(stableId);
  const documents = [...folderDocs, ...actors];
  assert.equal(new Set(documents.map(doc => doc._id)).size, documents.length, "Stable document IDs are unique");

  await mkdir(packRoot, {recursive: true});
  try {
    await mkdir(buildLock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error("Another Trivial Characters pack build or check is in progress.", {cause: error});
  }
  let stage;
  try {
    stage = await mkdtemp(join(packRoot, ".build-"));
    const compiled = join(stage, "compiled");
    const checkCopy = join(stage, "check");
    if (check) {
      await cp(packPath, checkCopy, {recursive: true});
    } else {
      const source = join(stage, "source");
      await mkdir(source);
      await Promise.all(documents.map(doc => writeFile(join(source, doc._id + ".json"), JSON.stringify(doc))));
      await compilePack(source, compiled);
      await cp(compiled, checkCopy, {recursive: true});
    }
    await checkPack(checkCopy, join(stage, "extracted"), documents);

    if (!check) {
      // The actual LevelDB data files stay with the pack. These files are regenerated by the database.
      await Promise.all(["LOCK", "LOG", "LOG.old"].map(name => rm(join(compiled, name), {force: true})));
      await publishPack(packPath, stage, compiled);
    }
  } finally {
    if (stage) await rm(stage, {recursive: true, force: true});
    await rm(buildLock, {recursive: true, force: true});
  }

  console.log("Verified " + actors.length + " Actors and " + folderDocs.length + " folders in " + pack.label + ".");
}

assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--check"),
  "Usage: node scripts/build-pack.mjs [--check]");
await build({check: process.argv[2] === "--check"});
