#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [, , inputArg, outputArg] = process.argv;

if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/render.mjs <model.json> <output.html>");
  process.exit(2);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(skillDir, "assets/template.html");

function fail(messages) {
  const details = messages.map((message) => `  - ${message}`).join("\n");
  throw new Error(`Invalid codebase map model:\n${details}`);
}

function validate(model) {
  const errors = [];
  const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  if (!model || typeof model !== "object" || Array.isArray(model)) {
    fail(["root must be a JSON object"]);
  }

  for (const field of ["title", "repository", "summary"]) {
    if (typeof model[field] !== "string" || !model[field].trim()) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of ["groups", "nodes", "flows"]) {
    if (!Array.isArray(model[field])) {
      errors.push(`${field} must be an array`);
    }
  }

  if (errors.length > 0) fail(errors);
  if (model.groups.length === 0) errors.push("groups must not be empty");
  if (model.nodes.length === 0) errors.push("nodes must not be empty");

  const validateIds = (items, type) => {
    const ids = new Set();
    for (const [index, item] of items.entries()) {
      const prefix = `${type}[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${prefix} must be an object`);
        continue;
      }
      if (typeof item.id !== "string" || !idPattern.test(item.id)) {
        errors.push(`${prefix}.id must use lowercase kebab-case`);
      } else if (ids.has(item.id)) {
        errors.push(`${prefix}.id duplicates ${item.id}`);
      } else {
        ids.add(item.id);
      }
      if (typeof item.label !== "string" || !item.label.trim()) {
        errors.push(`${prefix}.label must be a non-empty string`);
      }
    }
    return ids;
  };

  const groupIds = validateIds(model.groups, "groups");
  const nodeIds = validateIds(model.nodes, "nodes");
  validateIds(model.flows, "flows");

  for (const [index, node] of model.nodes.entries()) {
    const prefix = `nodes[${index}]`;
    if (!groupIds.has(node.group)) {
      errors.push(
        `${prefix}.group references unknown group ${JSON.stringify(node.group)}`,
      );
    }
    for (const field of ["x", "y"]) {
      if (typeof node[field] !== "number" || !Number.isFinite(node[field])) {
        errors.push(`${prefix}.${field} must be a finite number`);
      }
    }
    if (
      typeof node.responsibility !== "string" ||
      !node.responsibility.trim()
    ) {
      errors.push(`${prefix}.responsibility must be a non-empty string`);
    }
    if (
      node.line !== undefined &&
      (!Number.isInteger(node.line) || node.line < 1)
    ) {
      errors.push(`${prefix}.line must be a positive integer when provided`);
    }
  }

  for (const [flowIndex, flow] of model.flows.entries()) {
    const prefix = `flows[${flowIndex}]`;
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
      errors.push(`${prefix}.steps must be a non-empty array`);
      continue;
    }
    for (const [stepIndex, step] of flow.steps.entries()) {
      const stepPrefix = `${prefix}.steps[${stepIndex}]`;
      if (!step || typeof step !== "object" || Array.isArray(step)) {
        errors.push(`${stepPrefix} must be an object`);
        continue;
      }
      if (!nodeIds.has(step.from)) {
        errors.push(
          `${stepPrefix}.from references unknown node ${JSON.stringify(step.from)}`,
        );
      }
      if (!nodeIds.has(step.to)) {
        errors.push(
          `${stepPrefix}.to references unknown node ${JSON.stringify(step.to)}`,
        );
      }
      for (const field of ["label", "payload"]) {
        if (typeof step[field] !== "string" || !step[field].trim()) {
          errors.push(`${stepPrefix}.${field} must be a non-empty string`);
        }
      }
    }
  }

  if (errors.length > 0) fail(errors);
}

try {
  const rawModel = await readFile(inputPath, "utf8");
  const model = JSON.parse(rawModel);
  validate(model);

  const template = await readFile(templatePath, "utf8");
  const marker = "__CODEBASE_MAP_MODEL__";
  if (template.split(marker).length !== 2) {
    throw new Error(`Template must contain exactly one ${marker} marker`);
  }

  const serialized = JSON.stringify(model)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  const html = template.replace(marker, serialized);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  console.log(`Rendered codebase map: ${outputPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
