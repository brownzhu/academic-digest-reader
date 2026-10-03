export interface KeywordDefinition {
  keyword: string;
  weight: number;
  aliases?: readonly string[];
}

export const DEFAULT_KEYWORD_PROFILE: readonly KeywordDefinition[] = [
  { keyword: "inverse problems", weight: 5 },
  { keyword: "electrical impedance tomography", weight: 5, aliases: ["EIT"] },
  { keyword: "inverse imaging", weight: 5 },
  { keyword: "imaging", weight: 3 },
  { keyword: "PDE", weight: 4, aliases: ["PDEs", "partial differential equation", "partial differential equations"] },
  { keyword: "numerical analysis", weight: 4 },
  { keyword: "scientific computing", weight: 4 },
  { keyword: "regularization", weight: 3 },
  { keyword: "optimization", weight: 3 },
  { keyword: "finite element", weight: 3, aliases: ["finite elements", "FEM"] },
  { keyword: "iterative methods", weight: 3 },
  { keyword: "preconditioning", weight: 3, aliases: ["preconditioner", "preconditioners"] },
  { keyword: "computational mathematics", weight: 3 },
  { keyword: "scientific machine learning", weight: 2, aliases: ["SciML"] },
  { keyword: "operator learning", weight: 2 },
  { keyword: "machine learning", weight: 1 },
] as const;
