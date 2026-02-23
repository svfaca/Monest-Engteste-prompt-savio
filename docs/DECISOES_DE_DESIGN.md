# Decisões de Design

## 1. Por que Post-Processing de Resposta?

**Decisão:** Implementar `responseValidator.ts` para validar saída do LLM

**Alternativas Consideradas:**
- A: Apenas confiar no prompt do LLM
- B: Treinar modelo fine-tuned
- C: Post-processar com regras (escolhido)

**Razão:**
- Prompt é frágil: LLM pode ignorar se confidence for baixa
- Fine-tuning é custoso e lento
- Post-processing é determinístico, debugável, rápido
- Empresas financeiras precisam de **enforcement físico**

**Trade-off:**
- ✅ Segurança garantida
- ❌ Complexidade adicional

**Resultado:** Regras críticas (emoji, DNA, validação) são **impossíveis** de violar.

---

## 2. Por que Classificação Preparatória?

**Decisão:** Extrair intenção + emoção antes de chamar LLM

**Alternativas Consideradas:**
- A: LLM decide tudo (intenção, emoção, resposta)
- B: Classificador separado (escolhido)

**Razão:**
- Classificação é determinística, rápida, barata
- Permite contato de governança
- Debug: exatamente qual intenção causou qual resposta
- Testes: podemos mockar classificação independente

**Trade-off:**
- ✅ Auditoria clara
- ✅ Performance
- ❌ Dois chamados (um de classificação, um de LLM))

**Resultado:** Sistema auditável. Podemos dizer: "Cliente foi classified como X, então aplicamos estratégia Y"

---

## 3. Por que Estratégias em 3 Níveis?

**Decisão:** soft, balanced, firm (não contínuo)

**Alternativas Consideradas:**
- A: Contínuo (0.0 a 1.0)
- B: 3 níveis (escolhido)
- C: Dinâmico por cliente

**Razão:**
- Contínuo: LLM não sabe quando mudar tom
- 3 níveis: Claro. soft = amigável. firm = limite.
- Determinístico: mesma intenção → sempre mesma estratégia
- Testável: 3 casos, não infinitos

**Trade-off:**
- ✅ Simples, determinístico
- ❌ Menos granular

**Resultado:** LLM entende exatamente o que fazer. Sem ambiguidade.

---

## 4. Por que State/Session em Memória?

**Decisão:** `conversationManager.ts` mantém contexto de conversa

**Alternativas Consideradas:**
- A: Stateless + Redis
- B: Stateless + Banco de Dados
- C: State em memória (escolhido para MVP)

**Razão:**
- MVP: simplicidade
- Permite testes sem infrastructure
- Conversa típica = dias, não meses

**Para Produção:**
```
interface PersistenceLayer {
  saveSession(clientId, context)
  loadSession(clientId)
}
// Redis ou Postgres
```

**Trade-off:**
- ✅ Simples, rápido
- ❌ Perda de estado se servidor cair

**Resultado:** Implementação rápida. Pronta para migrar para Redis quando escalar.

---

## 5. Por que Resistência com Contador?

**Decisão:** `resistanceCount++` em vez de apenas "is resisting"

**Alternativas Consideradas:**
- A: Booleano: is_resisting (verdadeiro/falso)
- B: Contador (escolhido)

**Razão:**
- Booleano: não há escalação
- Contador: 1a resistência = explorar, 2a = novo ângulo, 3a = limite
- Respeita cliente progressivamente

**Exemplo:**
```
1a: "Entendo sua preocupação, posso perguntar..."
2a: "Você pode confirmar em nossos canais oficiais antes?"
3a: "Sem confirmação de CPF, não posso prosseguir."
```

**Trade-off:**
- ✅ Escalação inteligente
- ❌ Mais estados para testar

**Resultado:** Cliente se sente ouvido, não pressizado.

---

## 6. Por que Validações Separadas?

**Decisão:** `documentValidator.ts` + `responseValidator.ts` (dois validadores)

**Alternativas Consideradas:**
- A: Um validador único
- B: Dois especializados (escolhido)

**Razão:**
- Document: valida estrutura de CPF/CNPJ (input)
- Response: valida regras de negócio (output)
- Concerns diferentes, testes diferentes

**Trade-off:**
- ✅ Responsabilidades claras
- ❌ Dois arquivos

**Resultado:** Fácil testar cada validação isoladamente.

---

## 7. Por que Exceptions para Greeting?

**Decisão:** `if (intent === "greeting") → riskLevel="low"`

**Alternativas Consideradas:**
- A: Mesma lógica de classificação para todos
- B: Exception específica para greeting (escolhido)

**Razão:**
- Greeting é sempre baixo risco (é só uma saudação!)
- Sem exception: "Oi" com confidence 0.3 vira medium risco (errado)
- Negócio: não queremos parecer paranóicos para saudações

**Trade-off:**
- ✅ Experiência natural
- ❌ Special case

**Resultado:** Cliente não sente paranoia. Conversa natural.

---

## 8. Governança: Por que Aplicar Antes do LLM?

**Decisão:** Aplicar `applyGovernanceRules()` **antes** de chamar LLM

**Alternativas Consideradas:**
- A: Aplicar regras após (pós-processamento)
- B: Aplicar antes (escolhido)

**Razão:**
- Antes: LLM já sabe a estratégia certa → resposta melhor
- Depois: LLM pode gerar resposta errada, depois corretar

**Trade-off:**
- ✅ Resposta do LLM já alinhada
- ❌ Contexto complexo para passar

**Resultado:** Menos pós-processamento. Respostas já certas de primeira.

---

## Resumo de Princípios

1. **Determinístico > Mágico**
   - Classificação, governança, validação: regras claras

2. **Auditável > Flex**
   - Sempre sabemos por quê cada decisão foi tomada

3. **Testável > Complexo**
   - 3 estratégias, não contínuo. Fácil escrever 3 testes.

4. **MVP > Perfeito**
   - State em memória agora. Redis depois.
   - Validator simples agora (regex). ML depois.

5. **Regras Físicas > Esperança**
   - Post-processing garante, não confia em prompt
---

## 6. Cenário Pós-Lançamento: 30% de Abandono na Validação

**Situação:** Após lançar, descobrimos que 30% dos clientes abandonam durante WAITING_DOCUMENT.

**Diagnóstico Possível:**
- Intenção: Cliente está frustrado pelo tom muito formal
- Intenção: Cliente não entendeu por que precisa validar
- Intenção: Cliente tem medo que seja fraude

**Ações de Refinamento (em ordem de impacto):**

### Fase 1: Análise + Instrumentação (Semana 1)

1. Habilitar logs detalhados:
   - Onde exato abandona? (after msg 1? msg 3?)
   - Qual emoção detectada?
   - Qual estratégia foi aplicada?

2. Agrupar por padrão:
   - Abandonos após "soft" vs "firm"?
   - Abandonos após resposta com emoji vs sem?
   - Abandonos por horário, dispositivo?

### Fase 2: Hipóteses Testáveis (Semana 2)

- **H1: Tom muito formal** → Reduzir jargão (teste A/B)
  - Antes: "Sem isso não consigo avançar"
  - Depois: "Só pra garantir que é você mesmo"

- **H2: Mensagem muito curta** → Aumentar contexto
  - Antes: "Seu CPF?"
  - Depois: "Pra liberar crédito, preciso confirmar que é você. Qual seu CPF?"

- **H3: Estratégia "soft" demais** → Aumentar clareza
  - Antes: "Sem esse dados não avanço"
  - Depois: "A gente só libera crédito confirmando identidade. Me passa seu CPF"

- **H4: Rejeição após 1 tentativa** → Oferecer canal alternativo
  - Depois de 2 tentativas: "Prefere validar por SMS em vez de aqui?"

### Fase 3: Implementação (Semana 3-4)

**Opção A (Rápida): Ajustar prompts**
- Teste A/B: 50% clientes → prompt v1, 50% → prompt v2
- Métrica: conversão (VALIDATED / WAITING_DOCUMENT)
- Esperado: +10-15% se for só tom

**Opção B (Média): Adicionar contexto na 1ª msg**
- Alterar [systemPrompt.hbs](../src/templates/systemPrompt.hbs)
- Adicionar contexto explicativo na mensagem inicial

**Opção C (Robusta): Estratégia adaptativa**
- Se 2 tentativas AND emotion == "frustrated" → oferecer alternativa
- Implementar em [conversationManager.ts](../src/state/conversationManager.ts)
- Lógica: detectar frustração e sugerir SMS ou chamada

**Opção D (Investigação): Segmentar por tipo cliente**
- Clientes novos vs retornantes
- Clientes mobile vs desktop
- Horário do dia
- Aplicar estratégias diferentes por segmento

### Fase 4: Monitoramento (Contínuo)

**Dashboard Crítico:**
- Funnel: START → VALIDATED (%) → COMPLETED (%)
- Tempo médio em WAITING_DOCUMENT por estratégia
- Taxa de re-engagement por canal alternativo
- NPS durante validação

**Alertas:**
- Se abandono > 35% → escalar
- Se frustration + 2 tentativas → oferecer suporte
- Se abandono por horário específico → investigar

**Resultado Esperado:**
- Semana 2: Diagnóstico claro
- Semana 4: Implementação reduz para ~15-20%
- Semana 6: Rollout de melhor estratégia

**Trade-off:**
- ✅ Data-driven, não especulação
- ✅ A/B testing valida impacto real
- ❌ Requer logging robusto
- ❌ Precisa de volume (300+ clientes/semana)