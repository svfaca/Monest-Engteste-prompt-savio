import { cpf, cnpj } from "cpf-cnpj-validator";

export type DocumentValidationResult = {
  isValid: boolean;
  isCPF: boolean | null;
  normalizedValue: string | null;
};

export function validateDocument(input: string): DocumentValidationResult {
  const cleaned = input.replace(/\D/g, "");

  if (cleaned.length === 11) {
    const isValidCPF = cpf.isValid(cleaned);
    return {
      isValid: isValidCPF,
      isCPF: true,
      normalizedValue: isValidCPF ? cpf.format(cleaned) : null
    };
  }

  if (cleaned.length === 14) {
    const isValidCNPJ = cnpj.isValid(cleaned);
    return {
      isValid: isValidCNPJ,
      isCPF: false,
      normalizedValue: isValidCNPJ ? cnpj.format(cleaned) : null
    };
  }

  return {
    isValid: false,
    isCPF: null,
    normalizedValue: null
  };
}

export function looksLikeDocument(input: string): boolean {
  const cleaned = input.replace(/\D/g, "");
  return cleaned.length === 11 || cleaned.length === 14;
}