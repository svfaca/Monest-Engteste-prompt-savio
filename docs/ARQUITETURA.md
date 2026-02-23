# Arquitetura do Sistema

## Visão Geral

O sistema funciona como um pipeline com 5 estágios de processamento:

```
WhatsApp Input → Classification → Context Management → LLM Generation → Validation → Output
```

## Camada 1: Receptor (HTTP)

**Arquivo:** `src/routes/whatsappWebhook.ts`

- Recebe POST de webhooks do WhatsApp
- Extrai ID da conversa, usuário e conteúdo
- Passa para a camada de classificação

## Camada 2: Classificação

**Arquivo:** `src/services/messageClassifier.ts`

Responsabilidades:
- Análise de intenção (via prompt de classificação)
- Análise de emoção (via prompt de classificação)
- Cálculo de risco baseado em intenção + emoção

**Intenções:**
- `greeting`: Saudações ("Oi", "Olá")
- `direct_validation_request`: Cliente pedindo para validar ("Quer meu CPF?")
- `validation_resistance`: Cliente resistindo ("Não gosto disso", "Privacidade")
- `casual_chat`: Conversa casual ("Como vai?", "Po sei la kkk")
- `scam_suspicion`: Cliente desconfiado de fraude ("Vocês são mesmo do banco?")

**Emoções:**
- `neutral`: Padrão
- `playful`: Brincadeira
- `frustrated`: Frustrado
- `aggressive`: Agressivo

## Camada 3: Gerenciamento de Contexto

**Arquivo:** `src/state/conversationManager.ts`

Responsabilidades:
- Carregar/criar sessão do cliente
- Manter histórico de conversa
- Aplicar regras de governança
- Calcular estratégia de resposta

**Governança Crítica:**

1. **Agressividade ignora Confidence Baixo**
   - Se emotion = "aggressive" → riskLevel = "high", sem fallback

2. **Escalação de Resistência**
   - resistanceCount = 1: Exploração aberta
   - resistanceCount = 2: Exploração com ângulo novo (atestação)
   - resistanceCount ≥ 3: Limite firme (sem CPF, sem avanço)

3. **Exception para Greeting**
   - Saudações sempre → riskLevel = "low", strategyLevel = "soft"

4. **Detecção de Fraude**
   - Se scam_suspicion detectado → riskLevel = "high"
   - Estratégia: Comprovar legitimidade com canais oficiais

## Camada 4: Serviço LLM

**Arquivo:** `src/services/llmService.ts`

Responsabilidades:
- Renderizar template com contexto
- Carregar estratégia de resposta via prompt
- Chamar Claude com token control
- Entrega resposta bruta

**Templates:**
- `src/templates/systemPrompt.hbs`: Prompt governado com regras

Regras principais no prompt:
1. Não usar emoji durante validação
2. Sem menção DNA se sem intenção direta
3. Escalação inteligente baseada em resistência
4. Tom ajustado para estratégia (soft/balanced/firm)

## Camada 5: Validação de Resposta

**Arquivo:** `src/validators/responseValidator.ts`

Responsible:
- Post-processar resposta do LLM
- Detectar e corrigir violações
- Remover emoji durante validação
- Remover validação se sem intenção direta
- Log de violações para debug

## Fluxo de Dados: Exemplo Real

```
Input: "Po sei lak kkk"
        ↓
Classification: intent=casual_chat, emotion=playful, confidence=0.45
        ↓
Context + Governance:
  - riskLevel = "low" (greeting exception NÃO aplica)
  - strategyLevel = "soft" (casual → soft)
  - hasDirectIntent = false
        ↓
LLM Prompt:
  "Você é Mia. Cliente disse: 'Po sei lak kkk'. Intenção: casual_chat.
   Estratégia: soft. Não tem intenção direta.
   REGRA: Sem intenção direta → Não mencionar validação DNA.
   Responda em tom amigável."
        ↓
Resposta Bruta: "kkk acontece! 😊 Mas pra te ajudar bem, preciso validar"
        ↓
Validação: ERRO - menciona "validar" com hasDirectIntent=false
           Remove: "Mas pra te ajudar bem, preciso validar"
           Final: "kkk acontece! 😊"
        ↓
Output para WhatsApp
```

## Separação de Responsabilidades

| Componente | Responsabilidade | Não Faz |
|---|---|---|
| Classificador | Intent + Emotion | Não governa |
| Context Manager | Governança + Estratégia | Não gera resposta |
| LLM | Geração de resposta | Não valida regras |
| Response Validator | Pós-processamento | Não gera conteúdo novo |

Essa separação permite: testes isolados, debugging claro, mudanças isoladas.

## Trade-offs de Design

Ver [DECISOES_DE_DESIGN.md](DECISOES_DE_DESIGN.md)
