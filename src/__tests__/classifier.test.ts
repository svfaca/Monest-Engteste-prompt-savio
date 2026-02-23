/**
 * 🧪 TEST: Message Classifier
 * 
 * Testa a camada determinística de classificação.
 * 100% offline - nenhuma chamada externa.
 */

import { classifyMessage } from "../services/messageClassifier";

describe("Message Classifier - Core Classifications", () => {
  
  describe("Greeting Intent", () => {
    it("should detect greeting", () => {
      const result = classifyMessage("oi");
      expect(result.intent).toBe("greeting");
      expect(result.riskLevel).toBe("low");
    });

    it("should detect greeting with punctuation", () => {
      const result = classifyMessage("Oi!");
      expect(result.intent).toBe("greeting");
      expect(result.riskLevel).toBe("low");
    });

    it("should detect 'olá' as greeting", () => {
      const result = classifyMessage("olá");
      expect(result.intent).toBe("greeting");
      expect(result.riskLevel).toBe("low");
    });

    it("should detect 'bom dia' as greeting", () => {
      const result = classifyMessage("bom dia");
      expect(result.intent).toBe("greeting");
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("Direct Service Intent", () => {
    it("should detect direct service intent", () => {
      const result = classifyMessage("quero empréstimo");
      expect(result.intent).toBe("direct_service");
    });

    it("should detect 'posso fazer um empréstimo?' as direct service", () => {
      const result = classifyMessage("posso fazer um empréstimo?");
      expect(result.intent).toBe("direct_service");
    });

    it("should have low risk level for direct service", () => {
      const result = classifyMessage("Bom dia, posso fazer um empréstimo?");
      expect(result.intent).toBe("direct_service");
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("Scam Suspicion Intent", () => {
    it("should detect scam suspicion", () => {
      const result = classifyMessage("isso é golpe?");
      expect(result.intent).toBe("scam_suspicion");
      expect(result.riskLevel).toBe("medium");
    });

    it("should detect 'é golpe?' as scam suspicion", () => {
      const result = classifyMessage("é golpe?");
      expect(result.intent).toBe("scam_suspicion");
    });

    it("should detect 'como sei que não é golpe?' as scam suspicion", () => {
      const result = classifyMessage("como sei que não é golpe?");
      expect(result.intent).toBe("scam_suspicion");
    });
  });

  describe("Resistance Intent", () => {
    it("should detect resistance", () => {
      const result = classifyMessage("não quero passar");
      expect(result.intent).toBe("resistance");
      expect(result.riskLevel).toBe("medium");
    });

    it("should detect 'não vou dar' as resistance", () => {
      const result = classifyMessage("não vou dar meu cpf");
      expect(result.intent).toBe("resistance");
    });
  });

  describe("Emotional Share Intent", () => {
    it("should detect emotional share", () => {
      const result = classifyMessage("estou muito triste");
      expect(result.intent).toBe("emotional_share");
      expect(result.emotion).toBe("emotional");
      expect(result.riskLevel).toBe("low");
    });

    it("should have low risk for emotional content despite emotion", () => {
      const result = classifyMessage("meu pai faleceu");
      expect(result.riskLevel).toBe("low");
    });
  });

  describe("Casual Chat Intent", () => {
    it("should detect casual chat with 'kkk'", () => {
      const result = classifyMessage("kkk");
      expect(result.intent).toBe("casual_chat");
    });

    it("should detect casual chat with short messages", () => {
      const result = classifyMessage("top");
      expect(result.intent).toBe("casual_chat");
    });
  });

  describe("Aggressive Emotion", () => {
    it("should detect aggressive emotion", () => {
      const result = classifyMessage("para de insistir caralho");
      expect(result.emotion).toBe("aggressive");
      expect(result.riskLevel).toBe("high");
    });

    it("should force high risk level regardless of confidence", () => {
      const result = classifyMessage("para de insistir");
      if (result.emotion === "aggressive") {
        expect(result.riskLevel).toBe("high");
      }
    });

    it("should detect aggression with strong language", () => {
      const result = classifyMessage("vai se foder");
      expect(result.emotion).toBe("aggressive");
      expect(result.riskLevel).toBe("high");
    });
  });

  describe("Playful Emotion", () => {
    it("should detect playful + scam suspicion", () => {
      const result = classifyMessage("kkk é golpe sim?");
      expect(result.intent).toBe("scam_suspicion");
      expect(result.emotion).toBe("playful");
    });

    it("should detect playful emotion", () => {
      const result = classifyMessage("haha brincadeira");
      expect(result.emotion).toBe("playful");
    });
  });

  describe("Confidence Scoring", () => {
    it("should provide confidence score", () => {
      const result = classifyMessage("oi");
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("should have high confidence for clear greeting", () => {
      const result = classifyMessage("olá bom dia");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should have signals array for debugging", () => {
      const result = classifyMessage("oi");
      expect(result.signals).toBeDefined();
      expect(Array.isArray(result.signals)).toBe(true);
      expect(result.signals.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle very short text", () => {
      const result = classifyMessage("o");
      expect(result.intent).toBeDefined();
      expect(result.emotion).toBe("neutral");
    });

    it("should handle short casual messages", () => {
      const result = classifyMessage("ok");
      expect(result.intent).toBeDefined();
    });

    it("should handle case insensitivity", () => {
      const result = classifyMessage("OI");
      expect(result.intent).toBe("greeting");
    });

    it("should handle mixed case", () => {
      const result = classifyMessage("É GOLPE?");
      expect(result.intent).toBe("scam_suspicion");
    });
  });

  describe("Classification Signals", () => {
    it("should include intent in signals", () => {
      const result = classifyMessage("oi");
      expect(result.signals.some((s: string) => s.startsWith("intent:"))).toBe(true);
    });

    it("should include emotion in signals", () => {
      const result = classifyMessage("oi");
      expect(result.signals.some((s: string) => s.startsWith("emotion:"))).toBe(true);
    });

    it("should include risk in signals", () => {
      const result = classifyMessage("oi");
      expect(result.signals.some((s: string) => s.startsWith("risk:"))).toBe(true);
    });
  });

  describe("Combined Scenarios", () => {
    it("should classify realistic conversation start", () => {
      const result = classifyMessage("Oi, tudo bem? Gostaria de saber sobre um empréstimo.");
      expect(result.intent).toBe("direct_service");
      expect(result.riskLevel).toBe("low");
    });

    it("should classify skeptical customer", () => {
      const result = classifyMessage("Mas como sei que não é golpe?");
      expect(result.intent).toBe("scam_suspicion");
      expect(result.emotion).not.toBe("aggressive");
    });

    it("should classify frustrated customer", () => {
      const result = classifyMessage("Já passei isso tudo antes, por quê de novo?");
      expect(result.emotion).toMatch(/frustrated|suspicious/);
    });
  });
});
