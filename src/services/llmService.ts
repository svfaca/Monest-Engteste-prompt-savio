import OpenAI from "openai";
import { renderSystemPrompt } from "./templateService";
import { ConversationState, StrategyLevel } from "../types/conversation";
import { MessageClassification } from "./messageClassifier";

const customerContext = {
  companyName: "Banco Nova Era",
  clientName: "Pedro Silva",
  firstName: "Pedro",
  isCPF: true
};

/**
 * � Detecta intenção direta de serviço em primeira mensagem
 * Exemplos: "posso fazer um empréstimo?", "quero crédito", "qual a taxa?"
 * 
 * @param message Mensagem do cliente
 * @returns boolean true se contém intenção direta de serviço
 */
export function hasDirectServiceIntent(message: string): boolean {
  const clean = message.toLowerCase().trim();
  
  // Padrões de intenção direta
  const intentPatterns = [
    // Loan/Credit requests
    /empréstim|crédito|financiamento|dinheiro|pega/,
    /consigo.*empréstim|consigo.*crédito|consigo.*dinheiro/,
    /posso.*empréstim|posso.*crédito|pode.*me.*dar/,
    /quero.*empréstim|quero.*crédito|quero.*dinheiro/,
    
    // Pricing/rates queries
    /qual.*taxa|qual.*juros|qual.*valor|qual.*limite/,
    /quanto.*custa|quanto.*cobra|quanto.*juros/,
    /qual.*proposta|qual.*oferta/,
    
    // How to get variants
    /como.*consigo|como.*faço.*conseguir|como.*pego/,
    /qual.*procedimento|qual.*processo|como.*funciona/,
    
    // Direct service keywords
    /empréstimo rápido|crédito fácil|crédito aprovado/,
    /refinanciamento|renegociação/
  ];
  
  return intentPatterns.some(p => p.test(clean));
}

/**
 * �🔍 Detecta perguntas de teste de legitimidade
 * Exemplos: "qual meu nome?", "quem sou?", "como vc sabe meu nome?"
 * 
 * @param message Mensagem do cliente
 * @returns boolean true se for detectada pergunta de legitimidade
 */
export function isLegitimacyCheck(message: string): boolean {
  const terms = [
    "qual meu nome",
    "quem sou",
    "como você sabe meu nome",
    "como vc sabe meu nome",
    "meu nome é",
    "qual é meu nome",
    "vc sabe meu nome",
    "você sabe meu nome",
    "como você me conhece",
    "como vc me conhece",
    "como sabe que sou",
    "que nome você tem",
    "qual seu nome",
    "identifique-se"
  ];
  
  const clean = message.toLowerCase().trim();
  return terms.some(t => clean.includes(t));
}

/**
 * 🚨 Detecta suspeitas de golpe ou questões de autenticidade
 * Exemplos: "é golpe?", "por que pedir CPF?", "como sei que é você?"
 * 
 * @param message Mensagem do cliente
 * @returns boolean true se for detectada suspeita de golpe
 */
export function isSuspiciousOfScam(message: string): boolean {
  const clean = message.toLowerCase().trim();
  
  // Padrões exatos mais rígidos (primeira camada)
  const exactTerms = [
    "isso é golpe",
    "é golpe",
    "golpe",
    "quer me enganar",
    "não acredito",
    "desconfiado",
    "qual a autenticidade",
    "suspeito",
  ];
  
  if (exactTerms.some(t => clean.includes(t))) {
    return true;
  }
  
  // Padrões flexíveis com regex (segunda camada)
  const flexiblePatterns = [
    /como\s+(eu\s+)?sei\s+que\s+(é|você|sou)/, // "como sei que é você", "como eu sei que..."
    /como\s+(eu\s+)?sei\s+que\s+é\s+válido/, // "como sei que é válido"
    /para\s+(confirmar|que)/, // "para confirmar", "para que"
    /confirmar\s+(isso|sua)/, // "confirmar isso", "confirmar sua identidade"
    /por\s+que\s+ped(ir)?\s+(cpf|cnpj|seu|meu|seus|meus|vocês)/, // "por que pedir cpf", "por que vocês querem"
    /por\s+que\s+voc(ê|ês)\s+(quer|querem)/, // "por que você/vocês quer/querem"
    /é\s+seguro|posso\s+confiar/ // "é seguro?", "posso confiar?"
  ];
  
  return flexiblePatterns.some(p => p.test(clean));
}

/**
 * 🧠 Interface para contexto de classificação
 */
export interface ClassificationContext {
  classification?: MessageClassification;
  isFirstInteraction?: boolean;
  hasDirectIntent?: boolean;
}

export async function generateWithTools(
  messages: any[], 
  state: ConversationState = ConversationState.START,
  strategyLevel: StrategyLevel = "balanced",
  classificationContext?: ClassificationContext
) {

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // 🔥 Builds classification context string for system prompt
  let classificationHints = "";
  if (classificationContext?.classification) {
    const c = classificationContext.classification;
    classificationHints = `
════════════════════════════════════
🎯 CLASSIFICAÇÃO PRÉ-PROCESSADA (Determinística)
════════════════════════════════════

O backend já classificou esta mensagem:

- INTENÇÃO: ${c.intent}
- EMOÇÃO: ${c.emotion}
- RISCO: ${c.riskLevel}
- CONFIANÇA: ${(c.confidence * 100).toFixed(0)}%
${classificationContext.isFirstInteraction ? '- PRIMEIRA INTERAÇÃO: sim' : ''}
${classificationContext.hasDirectIntent ? '- INTENÇÃO DIRETA: sim (vá direto ao CPF)' : ''}

════════════════════════════════════
🔒 GOVERNANÇA: strategyLevel É BACKEND DECISION
════════════════════════════════════

⚠️  CRÍTICO: Você DEVE USAR a estratégia que chegou no sistema prompt.
Se recebeu strategyLevel = "balanced", use "balanced".
Você NÃO pode mudar para "soft" ou "firm".

Por que? Porque:
- Backend calculou isso baseado em contexto COMPLETO
- Inclui histórico, tentativas, risco acumulado
- Governance bancária exige consistência determinística
- Inconsistência compromete segurança

Regra simples: Respeite a decisão do backend.

Se confidence < 0.7 → backend já forçou strategyLevel="balanced" + riskLevel="medium"

Use esta classificação para guiar sua resposta:

- Se intent = "scam_suspicion" E emotion = "playful" → Tom leve + institucional (não burocrático)
- Se intent = "scam_suspicion" → Tranquilize, não peça CPF neste turno
- Se intent = "legitimacy_test" → Confirme nome, depois peça CPF
- Se intent = "resistance" → Explore motivo antes de insistir
- Se intent = "emotional_share" → Seja empatítico, NÃO mencione CPF
- Se intent = "direct_service" → Vá direto ao CPF
- Se intent = "greeting" → Acolha primeiro
- Se emotion = "aggressive" → Mantenha compostura, riskLevel já é high
- Se emotion = "frustrated" → Não repita, varie abordagem

⚠️ IMPORTANTE: Esta classificação é DETERMINÍSTICA e deve ser respeitada.
`;
  }

  const systemPrompt = renderSystemPrompt({
    ...customerContext,
    STATE: state,
    strategyLevel: strategyLevel
  }) + classificationHints;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    tools: [
      {
        type: "function",
        function: {
          name: "validate_customer",
          description: "Valida informações de um cliente.",
          parameters: {
            type: "object",
            properties: {
              document: {
                type: "string"
              }
            },
            required: ["document"]
          }
        }
      }
    ],
    messages: [
      { role: "system", content: systemPrompt },
      ...messages
    ]
  });

  return response;
}

/**
 * 🔧 Prompt de reparo para corrigir resposta com JSON inválido
 * Usado quando o modelo responde fora do formato esperado
 */
export async function repairJsonResponse(
  invalidContent: string,
  state: ConversationState = ConversationState.START,
  strategyLevel: StrategyLevel = "balanced"
) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const repairPrompt = `Você recebeu uma resposta que deveria ser JSON válido mas não foi.

RESPOSTA ORIGINAL (INVÁLIDA):
${invalidContent}

Sua tarefa: Extrair a intenção e gerar um JSON válido no formato correto.

FORMATO OBRIGATÓRIO:
{
  "messages": ["mensagem1", "mensagem2 opcional"],
  "riskLevel": "low" | "medium" | "high",
  "shouldTerminate": false,
  "followUpRequired": true | false,
  "strategyLevel": "soft" | "balanced" | "firm"
}

REGRAS:
- Responda APENAS com o JSON
- Sem texto adicional
- Sem markdown
- Comece com { e termine com }

Estado atual: ${state}
Estratégia: ${strategyLevel}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: repairPrompt }
    ]
  });

  return response;
}