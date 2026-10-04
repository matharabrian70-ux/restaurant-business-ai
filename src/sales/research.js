const ALLOWED_FIELDS = Object.freeze([
  "name",
  "website",
  "phone",
  "email",
  "location",
  "socialLinks",
  "hasOnlineOrdering",
  "deliveryAvailable",
  "multipleBranches",
  "notes"
]);

export function normalizeResearch(input = {}) {
  const output = {};
  for (const field of ALLOWED_FIELDS) {
    if (input[field] !== undefined) output[field] = input[field];
  }
  return {
    ...output,
    researchedAt: new Date().toISOString()
  };
}

export function researchCompleteness(research = {}) {
  const required = ["name", "location"];
  const missing = required.filter((field) => !research[field]);
  return {
    complete: missing.length === 0,
    missing
  };
}
