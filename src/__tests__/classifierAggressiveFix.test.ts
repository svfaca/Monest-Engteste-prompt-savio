import { classifyMessage } from "../services/messageClassifier";

describe("Classifier - Aggressive Detection Fix", () => {
  
  test("vai se fuder → detecta como aggressive", () => {
    const result = classifyMessage("vai se fuder");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0); // Maxima confianca
  });

  test("vai se foder (variacao) → detecta como aggressive", () => {
    const result = classifyMessage("vai se foder");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("FDP → detecta como aggressive", () => {
    const result = classifyMessage("FDP");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("filho da puta → detecta como aggressive", () => {
    const result = classifyMessage("filho da puta");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("caralho → detecta como aggressive", () => {
    const result = classifyMessage("caralho");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("merda → detecta como aggressive", () => {
    const result = classifyMessage("merda");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("imbecil → detecta como aggressive", () => {
    const result = classifyMessage("imbecil");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("idiota → detecta como aggressive", () => {
    const result = classifyMessage("idiota");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("burro → detecta como aggressive", () => {
    const result = classifyMessage("burro");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("cala a boca → detecta como aggressive", () => {
    const result = classifyMessage("cala a boca");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("vai embora → detecta como aggressive (TIER 2)", () => {
    const result = classifyMessage("vai embora");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("some daqui → detecta como aggressive (TIER 2)", () => {
    const result = classifyMessage("some daqui");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("me deixa em paz → detecta como aggressive (TIER 2)", () => {
    const result = classifyMessage("me deixa em paz");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("para de encher → detecta como aggressive (TIER 2)", () => {
    const result = classifyMessage("para de encher");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  test("vou denunciar → detecta como aggressive (TIER 2)", () => {
    const result = classifyMessage("vou denunciar");
    
    expect(result.emotion).toBe("aggressive");
    expect(result.riskLevel).toBe("high");
    expect(result.confidence).toBe(1.0);
  });

  // Casos NEGATIVOS: Nao deve detectar como aggressive
  test("Po sei lak kkk → NAO eh aggressive", () => {
    const result = classifyMessage("Po sei lak kkk");
    
    expect(result.emotion).not.toBe("aggressive");
    expect(result.riskLevel).not.toBe("high");
  });

  test("qual a taxa → NAO eh aggressive", () => {
    const result = classifyMessage("qual a taxa");
    
    expect(result.emotion).not.toBe("aggressive");
    expect(result.riskLevel).not.toBe("high");
  });

  test("posso fazer um emprestimo → NAO eh aggressive", () => {
    const result = classifyMessage("posso fazer um emprestimo");
    
    expect(result.emotion).not.toBe("aggressive");
    expect(result.riskLevel).not.toBe("high");
  });

});
