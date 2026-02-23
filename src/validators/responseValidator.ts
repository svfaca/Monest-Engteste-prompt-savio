import { logger } from "../utils/logger";

/**
 * 🔒 RESPONSE VALIDATOR
 * 
 * Enforce regras após LLM gerar mas ANTES de enviar para cliente
 * Garante consistência entre prompt rules e output real
 */

export interface ValidatedResponse {
  messages: string[];
  riskLevel: "low" | "medium" | "high";
  shouldTerminate: boolean;
  followUpRequired: boolean;
  strategyLevel: "soft" | "balanced" | "firm";
  violations: string[]; // Para debug
}

interface ValidationContext {
  hasDirectIntent: boolean;
  emotion?: string;
  intent?: string;
  isFirstInteraction?: boolean;
  riskLevel?: "low" | "medium" | "high";
  confidence?: number;
}

export function validateResponse(
  response: any,
  context: ValidationContext
): ValidatedResponse {
  const violations: string[] = [];
  let validated = { ...response };

  // ═══════════════════════════════════════════════════════════
  // 🚨 REGRA 1: SEM INTENÇÃO DIRETA = SEM MENÇÃO DE VALIDAÇÃO
  // ═══════════════════════════════════════════════════════════
  if (!context.hasDirectIntent && context.intent !== "direct_service") {
    const validationKeywords = [
      /\bcpf\b/i,
      /\bcnpj\b/i,
      /validar/i,
      /confirmar.*documento/i,
      /documento.*confirmar/i,
      /enviar.*documento/i,
      /preciso.*validar/i,
      /necessário.*cpf/i
    ];

    const messagesWithValidation = validated.messages.filter((msg: string) =>
      validationKeywords.some(pattern => pattern.test(msg))
    );

    if (messagesWithValidation.length > 0) {
      violations.push("RULE_1_VIOLATION: Menção de validação sem intenção direta");
      logger.warn("🚨 RULE 1 VIOLATION: Validação mencionada sem intenção direta", {
        intent: context.intent,
        messages: messagesWithValidation
      });

      // FIX: Remover menções de validação
      validated.messages = validated.messages.map((msg: string) => {
        let fixed = msg;
        // Remove common validation patterns
        fixed = fixed.replace(/\sPara que eu continue[,.]?/gi, "");
        fixed = fixed.replace(/\s*Mas.*?preciso validar.*?CPF[^.]*[.]/gi, ".");
        fixed = fixed.replace(/\s*preciso.*?confirmar.*?documento[^.]*[.]/gi, ".");
        fixed = fixed.replace(/\s*Sem validação[,.]?/i, "");
        
        // Se ficou vazio, retornar mensagem genérica
        if (fixed.trim().length < 5) {
          fixed = "Entendi! Como posso te ajudar?";
        }
        
        return fixed;
      });

      validated.followUpRequired = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🚨 REGRA 2: NUNCA EMOJI DURANTE VALIDAÇÃO/SOLICITAÇÃO
  // ═══════════════════════════════════════════════════════════
  const messages = validated.messages as string[];
  const hasDocumentRequest = messages.some(msg =>
    /\b(cpf|cnpj|documento|validar|confirmar)\b/i.test(msg)
  );

  if (hasDocumentRequest) {
    const emojiPattern = /[\u{1F300}-\u{1F9FF}]/gu; // Unicode emoji range
    
    validated.messages = messages.map((msg: string) => {
      if (emojiPattern.test(msg)) {
        violations.push("RULE_2_VIOLATION: Emoji durante solicitação de documento");
        logger.warn("🚨 RULE 2 VIOLATION: Emoji durante validação", { message: msg });
        
        // Remove emojis
        return msg.replace(emojiPattern, "");
      }
      return msg;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🚨 REGRA 3: EMOÇÃO = NÃO SOLICITAR CPF MESMO TURNO
  // ═══════════════════════════════════════════════════════════
  const emotionalEmotions = ["emotional", "playful"];
  
  if (emotionalEmotions.includes(context.emotion || "")) {
    const hasCpfRequest = validated.messages.some((msg: string) =>
      /cpf|cnpj|validar|documento/i.test(msg)
    );

    if (hasCpfRequest && context.intent === "emotional_share") {
      violations.push("RULE_3_VIOLATION: CPF solicitado após emoção");
      logger.warn("🚨 RULE 3 VIOLATION: Validação após compartilhamento emocional", {
        emotion: context.emotion,
        messages: validated.messages
      });

      // FIX: Remover solicitação neste turno
      validated.messages = validated.messages.filter((msg: string) =>
        !/cpf|cnpj|validar|documento/i.test(msg)
      );

      // Se ficou sem mensagens, adicionar mensagem genérica
      if (validated.messages.length === 0) {
        validated.messages = ["Estou aqui para ajudar. Como posso te assistir melhor?"];
      }

      validated.followUpRequired = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🔒 REGRA 4: RISKLEVEL GOVERNANÇA
  // ═══════════════════════════════════════════════════════════
  
  // Se confidence < 70%, forçar riskLevel=medium (governança)
  if ((context.confidence || 1) < 0.7 && validated.riskLevel !== "high") {
    violations.push("GOVERNANCE_OVERRIDE: RiskLevel ajustado por confidence threshold");
    logger.warn("🔒 Governance override: confidence < 70%", {
      confidence: context.confidence,
      originalRisk: validated.riskLevel,
      newRisk: "medium"
    });
    validated.riskLevel = "medium";
  }

  // ═══════════════════════════════════════════════════════════
  // 🔒 REGRA 5: VARIAÇÃO OBRIGATÓRIA
  // ═══════════════════════════════════════════════════════════
  // Flag para indicar se precisa de variação (detectar repetição literal)
  // Implementado em outro lugar, mas validar aqui
  
  if (violations.length > 0) {
    logger.info("✅ Response validado com fixes aplicadas", {
      violationCount: violations.length,
      violations
    });
  }

  return {
    messages: validated.messages,
    riskLevel: validated.riskLevel,
    shouldTerminate: validated.shouldTerminate ?? false,
    followUpRequired: validated.followUpRequired ?? true,
    strategyLevel: validated.strategyLevel ?? "balanced",
    violations
  };
}

/**
 * 🔍 Detecta se mensagem está pedindo documento
 */
export function isValidationRequest(message: string): boolean {
  const patterns = [
    /\bcpf\b/i,
    /\bcnpj\b/i,
    /\bdocumento\b/i,
    /validar/i,
    /confirmar.*documento/i,
    /enviar.*documento/i,
    /preciso.*validar/i
  ];

  return patterns.some(p => p.test(message));
}

/**
 * 📊 Generate validation report para logs
 */
export function generateValidationReport(
  response: ValidatedResponse
): string {
  if (response.violations.length === 0) {
    return "✅ Response válida (sem violações)";
  }

  return `⚠️ Response teve ${response.violations.length} violação(ões):
${response.violations.map(v => `  - ${v}`).join("\n")}`;
}
