import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const MAX_CLUSTERS = 200;
const MAX_TERMS = 200;
const NEGATION_WINDOW = 40;

const clusterEntrySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, 'cluster id must be snake_case lowercase'),
  label: z.string().min(1),
  keywords: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_TERMS),
  phrases: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_TERMS),
  aliases: z.array(z.string().min(1)).default([]),
  regex: z.array(z.string().min(1)).default([]),
  negations: z.array(z.string().min(1)).default([]),
  minHits: z.number().int().nonnegative().default(1),
});

const registrySchema = z.object({
  clusters: z.array(clusterEntrySchema).max(MAX_CLUSTERS),
});

export type CapabilityClusterDefinition = {
  id: string;
  label: string;
  keywords: string[];
  phrases: string[];
  aliases: string[];
  regex: string[];
  negations: string[];
  minHits: number;
};

export type CapabilityClusterRegistry = {
  clusters: CapabilityClusterDefinition[];
};

const CONFIG_PATH = join(__dirname, 'capability-clusters.json');

const normalizeTerms = (values: string[]) =>
  [...new Set(values.map((value) => value.trim().toLowerCase()))].filter(
    Boolean,
  );

const normalizeRegexList = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()))].filter(Boolean);

const loadRegistry = (): CapabilityClusterRegistry => {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  const validated = registrySchema.parse(parsed);

  const duplicatedIds = new Set<string>();
  const seenIds = new Set<string>();

  const clusters = validated.clusters.map((entry) => {
    const id = entry.id.trim().toLowerCase();
    if (seenIds.has(id)) {
      duplicatedIds.add(id);
    }
    seenIds.add(id);

    return {
      id,
      label: entry.label.trim(),
      keywords: normalizeTerms(entry.keywords),
      phrases: normalizeTerms(entry.phrases),
      aliases: normalizeTerms(entry.aliases),
      regex: normalizeRegexList(entry.regex),
      negations: normalizeTerms(entry.negations),
      minHits: entry.minHits ?? 1,
    };
  });

  if (duplicatedIds.size) {
    throw new Error(
      `Duplicate capability cluster ids detected: ${[...duplicatedIds].join(
        ', ',
      )}`,
    );
  }

  return { clusters };
};

export const CAPABILITY_CLUSTER_REGISTRY: CapabilityClusterRegistry =
  loadRegistry();

export function getCapabilityClusterRegistry(): CapabilityClusterRegistry {
  return CAPABILITY_CLUSTER_REGISTRY;
}
