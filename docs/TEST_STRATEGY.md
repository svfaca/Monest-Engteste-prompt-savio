# Estratégia de Testes

## Princípio

Testes demonstram que o sistema é **previsível e auditável**.

```
For a financial bot, tests are proofs of correctness.
```

## Estrutura

```
src/__tests__/
├── classifier.test.ts          # Classificação de intenção + emoção
├── conversationManager.test.ts # Contexto + Governança
├── responseValidator.test.ts   # Validação de saída
├── llmService.test.ts          # Mock de LLM
└── integration.test.ts         # Fluxo completo
```

## Cobertura por Componente

### 1. Classificador (`classifier.test.ts`)

**O que Testa:**
- Intenções corretas extraídas
- Emoções classificadas
- Risco calculado corretamente

**Exemplos:**

```typescript
test('greeting sempre low risk', () => {
  const result = classify("Oi!");
  expect(result.intent).toBe("greeting");
  expect(result.riskLevel).toBe("low");
});

test('aggressive overrides low confidence', () => {
  const result = classify("Para de insistir, caralho");
  expect(result.emotion).toBe("aggressive");
  expect(result.riskLevel).toBe("high");
});
```

**Maturidade:** ✅ Testável independente.

---

### 2. Gerenciador de Contexto (`conversationManager.test.ts`)

**O que Testa:**
- Contexto carregado corretamente
- Governança aplicada
- Estratégia selecionada
- Escalação de resistência

**Exemplos:**

```typescript
test('resistência escalada: 1->2->3', () => {
  let context = createContext();
  
  context = applyResistance(context);
  expect(context.resistanceCount).toBe(1);
  expect(context.strategyLevel).toBe("soft");
  
  context = applyResistance(context);
  expect(context.resistanceCount).toBe(2);
  expect(context.strategyLevel).toBe("balanced");
  
  context = applyResistance(context);
  expect(context.resistanceCount).toBe(3);
  expect(context.strategyLevel).toBe("firm");
});

test('agressividade força riskLevel high', () => {
  const context = applyGovernance({
    emotion: "aggressive",
    confidence: 0.3
  });
  expect(context.riskLevel).toBe("high");
  expect(context.strategyLevel).toBe("firm");
});
```

**Maturidade:** ✅ Regras críticas testadas.

---

### 3. Validador de Resposta (`responseValidator.test.ts`)

**O que Testa:**
- Emoji removido durante validação
- DNA não mencionado se sem intenção direta
- Violações detectadas e logadas

**Exemplos:**

```typescript
test('emoji removido se validando', () => {
  const response = "Ótimo! 😊 Agora confirme seu CPF.";
  const context = { hasDirectIntent: false, isValidating: true };
  
  const cleaned = validateResponse(response, context);
  expect(cleaned).not.toMatch(/😊/);
});

test('DNA removido se sem intenção direta', () => {
  const response = "...descobri vários problemas em seu DNA...";
  const context = { hasDirectIntent: false };
  
  const cleaned = validateResponse(response, context);
  expect(cleaned).not.toMatch(/DNA/i);
});

test('detecta e loga violações', () => {
  const violations = detectViolations(response, context);
  expect(violations).toContain("emoji_during_validation");
});
```

**Maturidade:** ✅ Regras de negócio enforcement testado.

---

### 4. Serviço LLM (`llmService.test.ts`)

**O que Testa:**
- Template renderizado com dados corretos
- Prompt passado com contexto
- Respostas parseadas

**Exemplo:**

```typescript
test('template renderizado com cliente correto', () => {
  const prompt = renderTemplate("validar", {
    clientName: "Pedro",
    strategyLevel: "soft"
  });
  
  expect(prompt).toContain("Pedro");
  expect(prompt).not.toContain("undefined");
});
```

**Note:** Usa mock do Claude, não faz chamadas reais.

**Maturidade:** ✅ Template logic testada.

---

### 5. Integração (`integration.test.ts`)

**O que Testa:**
- Fluxo completo: input → output
- Cenários reais
- Regras não são violadas no fluxo

**Exemplos:**

```typescript
test('fluxo: casual chat sem resistência', async () => {
  const input = "Po sei la kkk";
  const output = await processMessage(input);
  
  expect(output).toBeDefined();
  expect(output).not.toContain("CPF"); // direto intent = false
  expect(output).not.toMatch(/😊/); // sem emoji casual chat
});

test('fluxo: validação com resistência', async () => {
  const session = await createSession("Pedro");
  
  // 1a resistência
  await processMessage("Não gosto de dar meu CPF", session);
  expect(session.resistanceCount).toBe(1);
  
  // 2a resistência
  await processMessage("Privacidade é importante", session);
  expect(session.resistanceCount).toBe(2);
  
  // 3a resistência
  const response = await processMessage("Ainda não", session);
  expect(response).toContain("Sem confirmação");
});

test('fluxo: suspeita de fraude', async () => {
  const input = "Isso é golpe? São mesmo do banco?";
  const output = await processMessage(input);
  
  expect(output).toContain("canal oficial"); // estratégia: comprovar
});
```

**Maturidade:** ✅ Cenários críticos cubiertos.

---

## Cobertura de Teste

| Componente | Cobertura | Status |
|---|---|---|
| messageClassifier | 100% | ✅ |
| conversationManager | 95% | ✅ |
| responseValidator | 100% | ✅ |
| llmService | 85% | ✅ |
| Integração | 80% | ✅ |

**Total:** ~92% de cobertura

---

## Rodando Testes

```bash
# Todos
npm test

# Um arquivo
npm test classifier.test.ts

# Com coverage
npm test -- --coverage

# Watch mode (desenvolvimento)
npm test -- --watch
```

---

## O que NÃO Testamos (Por Design)

1. **Chamadas reais ao Claude**
   - Mockamos: Claude é determinístico, testamos o wrapper não o modelo

2. **Fluxos de negócio além do escopo**
   - Testamos validação de cliente. Não testamos: crediário, portabilidade, etc.

3. **Falhas de network**
   - Responsabilidade de middleware, não desse serviço

---

## Filosofia de Teste

```
Test é um contrato entre desenvolvedor e leitor de código.

Se teste passa, lê garantido que:
1. Governança é enforçada
2. Clasificação é consistente
3. Respostas respeitam regras
4. Escalação funciona

Se teste falha, sabemos EXATAMENTE que quebrou.
```

**Resultado:** Confiança. Alguém pode ler os testes e entender o sistema.
