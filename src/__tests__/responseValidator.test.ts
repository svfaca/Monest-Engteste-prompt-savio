import { validateResponse } from "../validators/responseValidator";

describe("Response Validator - Governance Enforcement", () => {
  
  test("REGRA 1: Sem intenção direta → remove validação", () => {
    const input = {
      messages: [
        "Parece que você está brincando! Mas para que eu possa ajudar... preciso validar seu CPF."
      ],
      riskLevel: "low" as const,
      shouldTerminate: false,
      followUpRequired: true,
      strategyLevel: "soft" as const
    };

    const result = validateResponse(input, {
      hasDirectIntent: false,
      intent: "casual_chat",
      emotion: "playful",
      isFirstInteraction: true,
      riskLevel: "low",
      confidence: 0.92
    });

    expect(result.violations).toContain("RULE_1_VIOLATION: Menção de validação sem intenção direta");
    expect(result.messages[0]).not.toMatch(/cpf|validar/i);
    expect(result.followUpRequired).toBe(false);
  });

  test("REGRA 2: Emoji durante validação → remove emoji", () => {
    const input = {
      messages: [
        "Entendi 😊. Para validar, preciso do seu CPF 🔐."
      ],
      riskLevel: "medium" as const,
      shouldTerminate: false,
      followUpRequired: true,
      strategyLevel: "balanced" as const
    };

    const result = validateResponse(input, {
      hasDirectIntent: false,
      intent: "question",
      emotion: "neutral",
      isFirstInteraction: false,
      riskLevel: "medium",
      confidence: 0.85
    });

    expect(result.violations).toContain("RULE_2_VIOLATION: Emoji durante solicitação de documento");
    // Emoji removido
    expect(result.messages[0]).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  test("REGRA 3: Com intenção direta → mantém validação", () => {
    const input = {
      messages: [
        "Ótimo! Posso simular sua proposta. Para isso, preciso validar seu CPF."
      ],
      riskLevel: "low" as const,
      shouldTerminate: false,
      followUpRequired: true,
      strategyLevel: "balanced" as const
    };

    const result = validateResponse(input, {
      hasDirectIntent: true,
      intent: "direct_service",
      emotion: "positive",
      isFirstInteraction: false,
      riskLevel: "low",
      confidence: 0.95
    });

    expect(result.violations.length).toBe(0);
    expect(result.messages[0]).toMatch(/CPF/i);
  });

  test("REGRA 4: Emoção → remove CPF mesmo turno", () => {
    const input = {
      messages: [
        "Sinto muito com sua situação. Para que eu possa ajudar, preciso do seu CPF para validar."
      ],
      riskLevel: "low" as const,
      shouldTerminate: false,
      followUpRequired: false,
      strategyLevel: "soft" as const
    };

    const result = validateResponse(input, {
      hasDirectIntent: false,
      intent: "emotional_share",
      emotion: "emotional",
      isFirstInteraction: false,
      riskLevel: "low",
      confidence: 0.88
    });

    expect(result.violations).toContain("RULE_3_VIOLATION: CPF solicitado após emoção");
    expect(result.messages[0]).not.toMatch(/cpf|cnpj|validar|documento/i);
  });

  test("REGRA 5 / GOVERNANÇA: Confidence < 70% → riskLevel = medium", () => {
    const input = {
      messages: ["Pode confirmar seu CPF?"],
      riskLevel: "low" as const,
      shouldTerminate: false,
      followUpRequired: true,
      strategyLevel: "balanced" as const
    };

    const result = validateResponse(input, {
      hasDirectIntent: false,
      intent: "greeting",
      emotion: "neutral",
      isFirstInteraction: true,
      riskLevel: "low",
      confidence: 0.65
    });

    expect(result.violations).toContain("GOVERNANCE_OVERRIDE: RiskLevel ajustado por confidence threshold");
    expect(result.riskLevel).toBe("medium");
  });

});
