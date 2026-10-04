export const PACKAGES = Object.freeze({
  basic: Object.freeze({ name: "Basic", setupKes: 45000, monthlyKes: 4500 }),
  professional: Object.freeze({ name: "Professional", setupKes: 75000, monthlyKes: 8500 }),
  enterprise: Object.freeze({ name: "Enterprise", setupKes: 150000, monthlyKes: "15000-25000+" }),
  founders: Object.freeze({ name: "First 3 Founders", setupKes: 40000, monthlyKes: 4500 })
});

export function getApprovedPackage(packageId) {
  const selected = PACKAGES[packageId];
  if (!selected) throw new Error("Unknown package");
  return selected;
}
