import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(projectRoot, "universe");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    fail(
      `${relativePath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}

function readYaml(relativePath) {
  try {
    return YAML.parse(read(relativePath));
  } catch (error) {
    fail(
      `${relativePath}: invalid YAML (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", "node_modules", "dist", "dist-demo", ".validation"].includes(
        entry.name,
      )
    )
      continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute));
    else result.push(absolute);
  }
  return result;
}

function parseFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    fail(`${path.relative(root, filePath)}: missing YAML frontmatter`);
    return undefined;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    fail(`${path.relative(root, filePath)}: unterminated YAML frontmatter`);
    return undefined;
  }
  try {
    return YAML.parse(text.slice(4, end));
  } catch (error) {
    fail(
      `${path.relative(root, filePath)}: invalid frontmatter (${error instanceof Error ? error.message : String(error)})`,
    );
    return undefined;
  }
}

function isFolderDescription(filePath) {
  const base = path.basename(filePath, ".md");
  return fs.existsSync(path.join(path.dirname(filePath), base));
}

const visualDocumentFiles = [];
const entityFiles = walk(root).filter((filePath) => {
  if (!filePath.endsWith(".md")) return false;
  const relative = path.relative(root, filePath);
  if (
    ["README.md", "README.es.md", "LICENSE.md", "TRADEMARKS.md"].includes(relative)
  )
    return false;
  if (relative.startsWith(`.everend${path.sep}templates${path.sep}`))
    return false;
  if (isFolderDescription(filePath)) return false;
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    try {
      const metadata = YAML.parse(match[1]);
      if (metadata?.forgeView && typeof metadata.forgeView === "object") {
        visualDocumentFiles.push(filePath);
        return false;
      }
    } catch {
      // The normal entity frontmatter pass reports malformed YAML once.
    }
  }
  return true;
});

const propertiesConfig = readJson(".everend/properties.json");
const propertyDefinitionsByPath = new Map();
function collectPropertyDefinitions(definitions = [], parentPath = []) {
  for (const definition of definitions) {
    if (typeof definition.id !== "string") continue;
    const propertyPath = [...parentPath, definition.id];
    propertyDefinitionsByPath.set(propertyPath.join("."), definition);
    collectPropertyDefinitions(definition.children, propertyPath);
  }
}
collectPropertyDefinitions(propertiesConfig?.baseProperties?.definitions);
collectPropertyDefinitions(propertiesConfig?.customFields?.definitions);
for (const id of propertiesConfig?.customFields?.globalFields ?? []) {
  if (!propertyDefinitionsByPath.has(id))
    propertyDefinitionsByPath.set(id, { id, type: "text" });
}
const entityTypeIds = new Set(
  (propertiesConfig?.entityTypes?.definitions ?? []).map((definition) => definition.id),
);

function validatePropertyTree(
  relative,
  frontmatter,
  entityType,
  references = [],
  record = frontmatter,
  parentPath = [],
) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  for (const [field, value] of Object.entries(record)) {
    if (parentPath.length === 0 && field === "variants") {
      if (entityType !== "character")
        fail(`${relative}: variants are supported only on characters`);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(`${relative}: 'variants' must be a map of variant IDs to labels and overrides`);
        continue;
      }
      for (const [variantId, variant] of Object.entries(value)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(variantId))
          fail(`${relative}: invalid variant id '${variantId}'`);
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
          fail(`${relative}: variant '${variantId}' must be an object`);
          continue;
        }
        if (typeof variant.label !== "string" || !variant.label.trim())
          fail(`${relative}: variant '${variantId}' needs a label`);
        if (variant.overrides !== undefined) {
          if (!variant.overrides || typeof variant.overrides !== "object" || Array.isArray(variant.overrides))
            fail(`${relative}: variant '${variantId}' overrides must be a property map`);
          else
            validatePropertyTree(relative, frontmatter, entityType, references, variant.overrides);
        }
      }
      continue;
    }
    const propertyPath = [...parentPath, field];
    const pathKey = propertyPath.join(".");
    const definition = propertyDefinitionsByPath.get(pathKey);
    if (!definition) {
      fail(`${relative}: property '${pathKey}' is not defined in .everend/properties.json`);
      continue;
    }
    if (
      Array.isArray(definition.appliesTo) &&
      typeof entityType === "string" &&
      !definition.appliesTo.includes(entityType)
    ) {
      fail(`${relative}: property '${pathKey}' does not apply to '${entityType}'`);
    }
    if (definition.type === "group") {
      if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
        fail(`${relative}: '${pathKey}' must be a nested object`);
      } else if (value && typeof value === "object") {
        validatePropertyTree(relative, frontmatter, entityType, references, value, propertyPath);
      }
      continue;
    }
    if (value === undefined || value === null) continue;

    const expectedArray =
      ["multiselect", "entity-ref-list"].includes(definition.type) ||
      ["tags", "aliases"].includes(field);
    if (expectedArray ? !Array.isArray(value) : Array.isArray(value)) {
      fail(
        `${relative}: '${pathKey}' must be ${expectedArray ? "a list" : "a single value"}`,
      );
      continue;
    }
    if (
      !expectedArray &&
      ["text", "select", "date", "url", "entity-ref"].includes(definition.type) &&
      typeof value !== "string"
    ) {
      fail(`${relative}: '${pathKey}' must be a string`);
      continue;
    }
    if (definition.type === "number" && typeof value !== "number") {
      fail(`${relative}: '${pathKey}' must be a number`);
      continue;
    }
    if (definition.type === "number" && typeof value === "number") {
      if (typeof definition.min === "number" && value < definition.min)
        fail(`${relative}: '${pathKey}' must be at least ${definition.min}`);
      if (typeof definition.max === "number" && value > definition.max)
        fail(`${relative}: '${pathKey}' must be at most ${definition.max}`);
    }
    if (definition.type === "boolean" && typeof value !== "boolean") {
      fail(`${relative}: '${pathKey}' must be a boolean`);
      continue;
    }
    if (expectedArray && value.some((item) => typeof item !== "string")) {
      fail(`${relative}: '${pathKey}' must contain only strings`);
      continue;
    }

    if (definition.options?.length) {
      const allowedValues = new Set(definition.options.map((option) => option.value));
      const values = expectedArray ? value : [value];
      for (const selected of values) {
        if (!allowedValues.has(String(selected)))
          fail(`${relative}: '${String(selected)}' is not a configured option for '${pathKey}'`);
      }
    }
    if (["entity-ref", "entity-ref-list"].includes(definition.type)) {
      references.push({ path: pathKey, value, definition });
    }
  }
}

const templateDirectory = path.join(root, ".everend", "templates");
if (fs.existsSync(templateDirectory)) {
  for (const filePath of walk(templateDirectory).filter((file) => file.endsWith(".md"))) {
    const relative = path.relative(root, filePath);
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      fail(`${relative}: missing YAML template frontmatter`);
      continue;
    }
    for (const token of ["id", "name", "status"]) {
      if (!new RegExp(`{{\\s*${token}\\s*}}`).test(match[1]))
        fail(`${relative}: template frontmatter must contain {{${token}}}`);
    }
    if (/\{\s+\{|\}\s+\}/.test(match[1])) {
      fail(`${relative}: malformed template placeholder`);
      continue;
    }
    try {
      const rendered = match[1]
        .replace(/{{\s*id\s*}}/g, "demworld-template")
        .replace(/{{\s*name\s*}}/g, "Demworld Template")
        .replace(/{{\s*status\s*}}/g, "draft");
      const frontmatter = YAML.parse(rendered);
      if (!frontmatter || typeof frontmatter !== "object") {
        fail(`${relative}: rendered template frontmatter must be a YAML object`);
        continue;
      }
      if (!entityTypeIds.has(frontmatter.type))
        fail(`${relative}: template type '${frontmatter.type}' is not defined in .everend/properties.json`);
      validatePropertyTree(relative, frontmatter, frontmatter.type);
    } catch (error) {
      fail(
        `${relative}: invalid rendered template frontmatter (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
}

const entityIds = new Map();
const entityFrontmatter = new Map();
const entityReferences = new Map();
for (const filePath of entityFiles) {
  const relative = path.relative(root, filePath);
  const frontmatter = parseFrontmatter(filePath);
  if (!frontmatter) continue;
  for (const field of ["id", "type", "name", "status"]) {
    if (typeof frontmatter[field] !== "string" || !frontmatter[field].trim()) {
      fail(`${relative}: missing required string field '${field}'`);
    }
  }
  if (
    typeof frontmatter.type === "string" &&
    entityTypeIds.size > 0 &&
    !entityTypeIds.has(frontmatter.type)
  ) {
    fail(`${relative}: entity type '${frontmatter.type}' is not defined in .everend/properties.json`);
  }
  const references = [];
  validatePropertyTree(relative, frontmatter, frontmatter.type, references);
  if (
    typeof frontmatter.id === "string" &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(frontmatter.id)
  ) {
    fail(`${relative}: invalid stable id '${frontmatter.id}'`);
  }
  if (frontmatter.id) {
    if (entityIds.has(frontmatter.id))
      fail(
        `${relative}: duplicate id '${frontmatter.id}' also used by ${entityIds.get(frontmatter.id)}`,
      );
    entityIds.set(frontmatter.id, relative);
    entityFrontmatter.set(frontmatter.id, frontmatter);
    entityReferences.set(frontmatter.id, references);
  }
}

for (const [entityId, frontmatter] of entityFrontmatter) {
  for (const { path: fieldPath, value, definition } of entityReferences.get(entityId) ?? []) {
    if (value === "") continue;
    const targetIds = Array.isArray(value) ? value : [value];
    for (const reference of targetIds) {
      if (typeof reference !== "string" || !entityFrontmatter.has(reference)) {
        fail(`${entityIds.get(entityId)}: '${fieldPath}' references missing entity '${String(reference)}'`);
        continue;
      }
      if (
        Array.isArray(definition.targetTypes) &&
        !definition.targetTypes.includes(entityFrontmatter.get(reference).type)
      ) {
        fail(
          `${entityIds.get(entityId)}: '${fieldPath}' references '${reference}' with unsupported type '${entityFrontmatter.get(reference).type}'`,
        );
      }
    }
  }
}

for (const filePath of visualDocumentFiles) {
  const relative = path.relative(root, filePath);
  const frontmatter = parseFrontmatter(filePath);
  const document = frontmatter?.forgeView;
  if (typeof frontmatter?.id !== "string" || typeof frontmatter?.name !== "string")
    fail(`${relative}: visual documents need stable id and name metadata`);
  if (!document || document.version !== 1) {
    fail(`${relative}: unsupported forgeView visual document`);
    continue;
  }
  if (document.kind === "timeline") {
    if (!document.calendar || !Array.isArray(document.items) || !Array.isArray(document.views)) {
      fail(`${relative}: timeline needs a calendar, items, and views`);
      continue;
    }
    for (const item of document.items) {
      if (!item || !["event", "period"].includes(item.kind) || typeof item.title !== "string" || !/^-?\d+$/.test(String(item.start))) {
        fail(`${relative}: invalid timeline item`);
        continue;
      }
      if (item.kind === "period" && !/^-?\d+$/.test(String(item.end)))
        fail(`${relative}: timeline period '${item.title}' needs an integer end ordinal`);
      if (item.reference && !entityFrontmatter.has(item.reference))
        fail(`${relative}: timeline item '${item.title}' references missing entity '${item.reference}'`);
    }
  } else if (document.kind === "relationships") {
    if (!document.variants || typeof document.variants !== "object" || !Array.isArray(document.relationshipTypes)) {
      fail(`${relative}: relationship map needs canvas variants and relationship types`);
      continue;
    }
    for (const [variantId, canvas] of Object.entries(document.variants)) {
      if (!canvas || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.edges)) {
        fail(`${relative}: relationship canvas '${variantId}' needs nodes and edges`);
        continue;
      }
      const nodeIds = new Set(canvas.nodes.map((node) => node.id));
      for (const node of canvas.nodes) {
        if (node.reference && !entityFrontmatter.has(node.reference))
          fail(`${relative}: relationship node '${node.name}' references missing entity '${node.reference}'`);
      }
      for (const edge of canvas.edges) {
        if (!nodeIds.has(edge.from?.nodeId) || !nodeIds.has(edge.to?.nodeId))
          fail(`${relative}: relationship edge '${edge.id}' references a missing node`);
        if (!document.relationshipTypes.some((type) => type.id === edge.typeId))
          fail(`${relative}: relationship edge '${edge.id}' uses an unknown type '${edge.typeId}'`);
      }
    }
  } else {
    fail(`${relative}: forgeView kind must be 'timeline' or 'relationships'`);
  }
}

const wikilinkTargets = new Set();
for (const filePath of entityFiles) {
  const frontmatter = parseFrontmatter(filePath);
  if (!frontmatter) continue;
  const candidates = [
    frontmatter.id,
    frontmatter.name,
    path.basename(filePath, ".md"),
    ...(Array.isArray(frontmatter.aliases) ? frontmatter.aliases : []),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim())
      wikilinkTargets.add(candidate.trim().toLocaleLowerCase());
  }
}

for (const filePath of entityFiles) {
  const relative = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, "utf8");
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = match[1].split("|")[0].split("#")[0].trim();
    if (target && !wikilinkTargets.has(target.toLocaleLowerCase()))
      fail(`${relative}: unresolved wikilink [[${target}]]`);
  }
}

const taxonomy = readYaml(".everend/taxonomy.yaml");
if (
  taxonomy?.specVersion !== "0.1" ||
  !taxonomy.types ||
  typeof taxonomy.types !== "object"
) {
  fail(".everend/taxonomy.yaml: expected specVersion 0.1 and a types object");
}

const compendium = readYaml(".everend/compendium.yaml");
if (compendium?.specVersion !== "0.1")
  fail(".everend/compendium.yaml: expected specVersion 0.1");
if (
  !Array.isArray(compendium?.publication?.statuses) ||
  !compendium.publication.statuses.includes("canon")
) {
  fail(".everend/compendium.yaml: publication.statuses must include canon");
}

const universe = readJson(".everend/universe.json");
if (typeof universe?.name !== "string" || !universe.name.trim())
  fail(".everend/universe.json: missing universe name");
if (typeof universe?.branchId !== "string" || !universe.branchId.trim())
  fail(".everend/universe.json: missing branch id");
if (taxonomy?.branch?.id !== universe?.branchId)
  fail(".everend/taxonomy.yaml: branch id does not match .everend/universe.json");

const manifestPath = ".everend/.pathbranching/manifest.json";
const manifest = readJson(manifestPath);
if (
  manifest?.version !== "0.2" ||
  !Array.isArray(manifest?.stories) ||
  manifest.stories.length === 0
) {
  fail(`${manifestPath}: expected a v0.2 manifest with at least one story`);
}

let storyCount = 0;
let sequenceCount = 0;
let eventCount = 0;
let branchCount = 0;
let finalCount = 0;

for (const entry of manifest?.stories ?? []) {
  storyCount += 1;
  const story = readJson(entry.path);
  if (!story) continue;
  const supportedStoryStorageVersions = new Set(["0.2", "0.5"]);
  if (
    !supportedStoryStorageVersions.has(story.storageVersion) ||
    story.storyId !== entry.id ||
    !Array.isArray(story.sequenceIds)
  ) {
    fail(`${entry.path}: invalid modular story metadata`);
    continue;
  }
  if (story.name !== entry.name)
    fail(`${entry.path}: story name does not match its manifest entry`);
  const canonicalStory = entityFrontmatter.get(entry.id);
  if (!canonicalStory || canonicalStory.type !== "story")
    fail(`${entry.path}: no matching WorldNotion story entity for '${entry.id}'`);
  else if (canonicalStory.name !== story.name)
    fail(`${entry.path}: story name does not match its WorldNotion entity`);
  if (
    typeof story.universeRootPath === "string" &&
    (path.isAbsolute(story.universeRootPath) ||
      path.win32.isAbsolute(story.universeRootPath))
  ) {
    fail(`${entry.path}: universeRootPath must not contain a machine-specific absolute path`);
  }

  const canonIds = new Set((story.canonRefs ?? []).map((ref) => ref.id));
  for (const canonId of canonIds) {
    if (!entityIds.has(canonId))
      fail(`${entry.path}: canon ref '${canonId}' has no matching entity`);
  }

  const sequences = [];
  const events = new Map();
  const branches = new Map();
  for (const sequenceId of story.sequenceIds) {
    const slug = String(sequenceId)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const sequencePath = `.everend/.pathbranching/stories/${entry.id}/sequences/${slug}/sequence.json`;
    const wrapped = readJson(sequencePath);
    const sequence = wrapped?.sequence;
    if (
      !sequence ||
      sequence.id !== sequenceId ||
      !Array.isArray(sequence.eventIds)
    ) {
      fail(`${sequencePath}: invalid sequence`);
      continue;
    }
    sequences.push(sequence);
    sequenceCount += 1;

    for (const eventId of sequence.eventIds) {
      const eventSlug = String(eventId)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const eventPath = `.everend/.pathbranching/stories/${entry.id}/sequences/${slug}/events/${eventSlug}.json`;
      const event = readJson(eventPath)?.event;
      if (!event || event.id !== eventId) {
        fail(`${eventPath}: missing or invalid event '${eventId}'`);
        continue;
      }
      const evpathPath = eventPath.replace(/\.json$/, ".evpath");
      const evpathAbsolutePath = path.join(root, evpathPath);
      if (!fs.existsSync(evpathAbsolutePath)) {
        fail(`${evpathPath}: missing canonical event narrative`);
      } else if (!fs.readFileSync(evpathAbsolutePath, "utf8").trim()) {
        fail(`${evpathPath}: canonical event narrative is empty`);
      }
      events.set(event.id, event);
      eventCount += 1;
      if (typeof event.text?.content !== "string" || !event.text.content.trim())
        fail(`${eventPath}: event is missing narrative text`);
      if (event.type === "final") finalCount += 1;
      const interactionDefinitions = new Map();
      for (const definition of event.interactionDefinitions ?? []) {
        if (typeof definition.id !== "string" || typeof definition.name !== "string" || !Array.isArray(definition.results)) {
          fail(`${eventPath}: invalid interaction definition`);
          continue;
        }
        interactionDefinitions.set(definition.id, definition);
        if (definition.mechanic?.kind === "skillcheck") {
          const mechanic = definition.mechanic;
          if (!mechanic.dice || !Number.isSafeInteger(mechanic.dice.count) || mechanic.dice.count < 1 || !Number.isSafeInteger(mechanic.dice.sides) || mechanic.dice.sides < 2)
            fail(`${eventPath}: skill check '${definition.name}' needs a valid dice pool`);
          const actorId = mechanic.actor?.kind === "entity" ? mechanic.actor.entityId : undefined;
          const actor = actorId ? entityFrontmatter.get(actorId) : undefined;
          if (!actor || actor.type !== "character") {
            fail(`${eventPath}: skill check '${definition.name}' needs a character actor`);
          } else if (mechanic.actor.variantId && mechanic.actor.variantId !== "base" && !actor.variants?.[mechanic.actor.variantId]) {
            fail(`${eventPath}: skill check '${definition.name}' references missing character variant '${mechanic.actor.variantId}'`);
          }
          const propertyId = mechanic.skill?.kind === "property" ? mechanic.skill.propertyId : undefined;
          const numericProperty = [...propertyDefinitionsByPath.values()].some((property) => property.id === propertyId && property.type === "number");
          if (!numericProperty) fail(`${eventPath}: skill check '${definition.name}' references a missing numeric property`);
        }
      }
      const interactionUseIds = new Set();
      for (const use of event.interactionUses ?? []) {
        if (typeof use.id !== "string" || interactionUseIds.has(use.id))
          fail(`${eventPath}: interaction uses need unique stable IDs`);
        interactionUseIds.add(use.id);
        if (!interactionDefinitions.has(use.definitionId))
          fail(`${eventPath}: interaction '${use.id}' references missing definition '${String(use.definitionId)}'`);
        if (!["before", "during", "after"].includes(use.moment))
          fail(`${eventPath}: interaction '${use.id}' has invalid timing`);
      }
      for (const ref of event.canonRefs ?? []) {
        if (!canonIds.has(ref))
          fail(
            `${eventPath}: event canon ref '${ref}' is absent from story.canonRefs`,
          );
      }
    }

    for (const branchId of sequence.branchIds ?? []) {
      const branchSlug = String(branchId)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const branchPath = `.everend/.pathbranching/stories/${entry.id}/sequences/${slug}/branches/${branchSlug}.json`;
      const branch = readJson(branchPath)?.branch;
      if (
        !branch ||
        branch.id !== branchId ||
        !Array.isArray(branch.eventIds)
      ) {
        fail(`${branchPath}: missing or invalid branch '${branchId}'`);
        continue;
      }
      branches.set(branch.id, branch);
      branchCount += 1;
    }
  }

  const allEventIds = new Set(events.keys());
  for (const sequence of sequences) {
    if (!allEventIds.has(sequence.entryEventId))
      fail(
        `Sequence '${sequence.id}' has missing entry event '${sequence.entryEventId}'`,
      );
    for (const eventId of sequence.eventIds) {
      if (!allEventIds.has(eventId))
        fail(`Sequence '${sequence.id}' references missing event '${eventId}'`);
    }
    for (const branchId of sequence.branchIds ?? []) {
      if (!branches.has(branchId))
        fail(
          `Sequence '${sequence.id}' references missing branch '${branchId}'`,
        );
    }
  }

  for (const branch of branches.values()) {
    for (const eventId of branch.eventIds) {
      const event = events.get(eventId);
      if (!event)
        fail(`Branch '${branch.id}' references missing event '${eventId}'`);
      else if (event.branchRef !== branch.id)
        fail(
          `Event '${eventId}' and branch '${branch.id}' disagree about membership`,
        );
    }
  }

  for (const event of events.values()) {
    if (event.type === "final" && (event.transitions?.length ?? 0) > 0)
      fail(`Terminal event '${event.id}' must not have outgoing transitions`);
    if (
      event.branchRef &&
      !branches.get(event.branchRef)?.eventIds.includes(event.id)
    ) {
      fail(
        `Event '${event.id}' references branch '${event.branchRef}' without reciprocal membership`,
      );
    }
    for (const transition of event.transitions ?? []) {
      if (transition.from !== event.id)
        fail(
          `Transition '${transition.id}' has wrong source '${transition.from}'`,
        );
      if (!allEventIds.has(transition.to))
        fail(
          `Transition '${transition.id}' targets missing event '${transition.to}'`,
        );
    }
  }
}

const branch = readYaml(".everend/branch.yaml");
if (branch?.id !== universe?.branchId)
  fail(".everend/branch.yaml: branch id does not match .everend/universe.json");
if (branch?.pathbranching?.storyId !== manifest?.activeStoryId)
  fail(".everend/branch.yaml: PathBranching story id does not match the active manifest story");

if (finalCount !== 6)
  fail(`Expected six narrative endings; found ${finalCount}`);

if (errors.length) {
  console.error(`Vault validation failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Vault validation passed: ${entityIds.size} entities, ${storyCount} story, ${sequenceCount} sequences, ${branchCount} branches, ${eventCount} events, ${finalCount} endings.`,
);
