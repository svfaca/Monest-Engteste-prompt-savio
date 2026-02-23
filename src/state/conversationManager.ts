import { ConversationContext, ConversationState, StrategyLevel } from "../types/conversation";
import { generateWithTools, isLegitimacyCheck, isSuspiciousOfScam, repairJsonResponse, ClassificationContext } from "../services/llmService";
import { validateDocument } from "../validators/documentValidator";
import { validateResponse, ValidatedResponse } from "../validators/responseValidator";
import { logger } from "../utils/logger";
import { classifyMessage, MessageClassification, UserIntent, UserEmotion } from "../services/messageClassifier";

const SESSION_TTL = 10 * 60 * 1000; // 10 minutos

interface HandleMessageInput {
  phone: string;
  message: string;
}

interface HandleMessageOutput {
  messages: string[];
  riskLevel: "low" | "medium" | "high";
  shouldTerminate: boolean;
  followUpRequired?: boolean; // 🔥 true = manter WAITING_DOCUMENT, false = apenas responder
  strategyLevel?: StrategyLevel; // 🔥 Modo estratégico dinâmico
}

export class ConversationManager {
  private sessions: Map<string, ConversationContext> = new Map();

  // ================================
  // Sessão
  // ================================

  private isExpired(session: ConversationContext): boolean {
    return Date.now() - session.lastInteraction > SESSION_TTL;
  }

  // 🔥 CÁLCULO DINÂMICO DE ESTRATÉGIA (LEGADO - sem classificação)
  // Usado quando não há classificação disponível
  private calculateStrategyLevel(session: ConversationContext): StrategyLevel {
    // Cliente novo ou amigável
    if (session.attempts === 0 && session.interactionCount <= 1) {
      return "soft";
    }

    // Cliente com resistência progressiva
    if (session.attempts >= 1 && session.interactionCount >= 3) {
      return "firm";
    }

    // Padrão: cliente normal aqui meio do caminho
    return "balanced";
  }

  // 🧠 CÁLCULO INTELIGENTE DE ESTRATÉGIA (COM CLASSIFICAÇÃO)
  // Usa emoção + intenção para decidir tom apropriado
  // 🔒 GOVERNANÇA: Backend decide strategyLevel, LLM respeita (não sobrescreve)
  private calculateStrategyFromClassification(
    session: ConversationContext,
    classification: MessageClassification
  ): StrategyLevel {
    const { intent, emotion, riskLevel, confidence } = classification;

    // 🚨 CONFIDENCE THRESHOLD (Regra 1 de Governança)
    // Se confiança < 70%, forçar balanced para contenção
    if (confidence < 0.7) {
      logger.info("⚠️  Strategy: BALANCED (confidence < 0.7 → fail-safe)", { 
        confidence: (confidence * 100).toFixed(0) + "%"
      });
      return "balanced";
    }

    // 🎭 PLAYFUL + SCAM SUSPICION (Nuance Comportamental)
    // Cliente está brincando mas com desconfiança → tom leve + institucional
    if (intent === "scam_suspicion" && emotion === "playful") {
      logger.info("🎭 Strategy: BALANCED (playful scam suspicion → leve + institucional)");
      return "balanced";
    }

    // 🔴 AGGRESSIVE → sempre FIRM (não escalar, mas ser assertivo)
    if (emotion === "aggressive") {
      logger.info("🎯 Strategy: FIRM (aggressive emotion)");
      return "firm";
    }

    // 🟡 SUSPICIOUS/FRUSTRATED → BALANCED (não pressionar demais)
    if (emotion === "suspicious" || emotion === "frustrated") {
      logger.info("🎯 Strategy: BALANCED (suspicious/frustrated emotion)");
      return "balanced";
    }

    // 🟢 EMOTIONAL → SOFT (suspender validação, ser humano)
    if (emotion === "emotional" || intent === "emotional_share") {
      logger.info("🎯 Strategy: SOFT (emotional context)");
      return "soft";
    }

    // 🟢 PLAYFUL → SOFT (manter leveza)
    if (emotion === "playful") {
      logger.info("🎯 Strategy: SOFT (playful emotion)");
      return "soft";
    }

    // 💰 DIRECT SERVICE + NEUTRAL/POSITIVE → pode ser mais direto
    if (intent === "direct_service") {
      if (emotion === "neutral" || emotion === "positive") {
        // Cliente quer serviço, está neutro → BALANCED (eficiente mas cordial)
        logger.info("🎯 Strategy: BALANCED (direct service + neutral/positive)");
        return "balanced";
      }
      if (emotion === "curious") {
        // Está curioso sobre o serviço → SOFT (educar primeiro)
        logger.info("🎯 Strategy: SOFT (direct service + curious)");
        return "soft";
      }
    }

    // 🚨 SCAM SUSPICION → BALANCED (não pressionar, mas não ser muito leve)
    if (intent === "scam_suspicion") {
      logger.info("🎯 Strategy: BALANCED (scam suspicion)");
      return "balanced";
    }

    // ❌ RESISTANCE → começa BALANCED, escala para FIRM se persistir
    if (intent === "resistance") {
      if (session.interactionCount >= 3) {
        logger.info("🎯 Strategy: FIRM (persistent resistance)");
        return "firm";
      }
      logger.info("🎯 Strategy: BALANCED (initial resistance)");
      return "balanced";
    }

    // 👋 GREETING → SOFT (acolher primeiro)
    if (intent === "greeting") {
      logger.info("🎯 Strategy: SOFT (greeting)");
      return "soft";
    }

    // 🔍 LEGITIMACY TEST → BALANCED (responder com autoridade)
    if (intent === "legitimacy_test") {
      logger.info("🎯 Strategy: BALANCED (legitimacy test)");
      return "balanced";
    }

    // 📄 DOCUMENT ATTEMPT → BALANCED (objetivo)
    if (intent === "document_attempt") {
      logger.info("🎯 Strategy: BALANCED (document attempt)");
      return "balanced";
    }

    // 📈 ESCALONAMENTO POR TENTATIVAS (fallback)
    if (session.attempts >= 2) {
      logger.info("🎯 Strategy: FIRM (multiple failed attempts)");
      return "firm";
    }

    // Padrão
    logger.info("🎯 Strategy: BALANCED (default)");
    return "balanced";
  }

  // � APLICA REGRAS DE GOVERNANÇA NA RESPOSTA
  // Garante que LLM respeita decisões do backend (notamment: confidence threshold)
  private applyGovernanceRules(
    response: HandleMessageOutput,
    classification: MessageClassification,
    sessionStrategy: StrategyLevel
  ): HandleMessageOutput {
    // � FIX #1: AGRESSIVIDADE IGNORA CONFIDENCE THRESHOLD
    // Se emotion === aggressive, ignorar confidence < 0.7 e forçar high risk
    // Agressividade nunca deve cair em fallback neutro
    if (classification.emotion === "aggressive") {
      logger.info("🔒 Governança: Agressividade detectada - ignorando confidence threshold", {
        confidence: (classification.confidence * 100).toFixed(0) + "%",
        overriddenRiskLevel: "high",
        overriddenStrategy: "firm"
      });
      response.riskLevel = "high";
      response.strategyLevel = "firm";
      return response;
    }

    // 🚨 REGRA 1: Confidence Threshold (aplicado APÓS agressividade check)
    // Se confiança < 70%, forçar riskLevel = medium (contenção)
    if (classification.confidence < 0.7 && response.riskLevel !== "high") {
      logger.info("🔒 Governança: Aplicando confidence threshold", {
        confidence: (classification.confidence * 100).toFixed(0) + "%",
        originalRiskLevel: response.riskLevel,
        newRiskLevel: "medium"
      });
      response.riskLevel = "medium";
    }

    // 🔒 REGRA 2: Backend Authority
    // strategyLevel passou pelo backend, LLM não pode sobrescrever
    // Se LLM enviou estratégia diferente, usar a do backend
    if (response.strategyLevel && response.strategyLevel !== sessionStrategy) {
      logger.warn("🔒 Governança: LLM tentou sobrescrever strategyLevel", {
        llmStrategy: response.strategyLevel,
        backendStrategy: sessionStrategy,
        action: "Using backend decision"
      });
      response.strategyLevel = sessionStrategy;
    }

    return response;
  }

  // 🧠 ATUALIZAR ESTRATÉGIA COM CLASSIFICAÇÃO
  private updateStrategyWithClassification(
    session: ConversationContext,
    classification: MessageClassification
  ) {
    session.strategyLevel = this.calculateStrategyFromClassification(session, classification);
  }

  // 🔥 ATUALIZAR ESTRATÉGIA DA SESSÃO (fallback quando sem classificação)
  // Usado em casos de erro ou quando não há classificação disponível
  private updateStrategyLevel(session: ConversationContext) {
    session.strategyLevel = this.calculateStrategyLevel(session);
  }

  getSession(phone: string): ConversationContext {
    const existing = this.sessions.get(phone);

    if (existing) {
      if (this.isExpired(existing)) {
        this.sessions.delete(phone);
      } else {
        existing.lastInteraction = Date.now();
        return existing;
      }
    }

    const newSession: ConversationContext = {
      phoneNumber: phone,
      state: ConversationState.START,
      attempts: 0,
      interactionCount: 0,
      resistanceCount: 0, // 🔥 Fix #2: Contador de resistência para variar exploração
      strategyLevel: "balanced",
      hasIntroduced: false,
      presentationCount: 0,
      history: [],
      lastInteraction: Date.now()
    };

    this.sessions.set(phone, newSession);
    return newSession;
  }

  private updateSession(session: ConversationContext) {
    session.lastInteraction = Date.now();
    this.sessions.set(session.phoneNumber, session);
  }

  resetSession(phone: string) {
    this.sessions.delete(phone);
  }

  private addToHistory(session: ConversationContext, message: any) {
    session.history.push(message);

    if (session.history.length > 4) {
      session.history.shift();
    }

    this.updateSession(session);
  }

  // ================================
  // Handler Principal
  // ================================

  async handleMessage({
    phone,
    message
  }: HandleMessageInput): Promise<HandleMessageOutput> {
    const session = this.getSession(phone);
    
    // 🔥 CONTADOR DE INTERAÇÕES: Incrementar NO TOPO
    // Cada mensagem do usuário conta, independente de estado/intenção/fluxo
    session.interactionCount += 1;

    switch (session.state) {
      case ConversationState.START:
        return this.handleStart(session, message);

      case ConversationState.WAITING_DOCUMENT:
        return this.handleWaitingDocument(session, message);

      case ConversationState.VALIDATED:
        return this.handleValidated(session, message);

      case ConversationState.OFFER_STAGE:
        return this.handleOfferStage(session, message);

      case ConversationState.COMPLETED:
        return this.handleCompleted(session);

      default:
        this.resetSession(phone);
        return {
          messages: ["Ocorreu um erro inesperado."],
          riskLevel: "low",
          shouldTerminate: true
        };
    }
  }

  // ================================
  // START
  // ================================

  // 🔥 DETECTOR DE INTENÇÃO DIRETA
  private hasDirectServiceIntent(message: string): boolean {
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

  private async handleStart(
    session: ConversationContext,
    incomingMsg: string
  ): Promise<HandleMessageOutput> {
    // 🧠 CLASSIFICAÇÃO DETERMINÍSTICA PRIMEIRO
    const classification = classifyMessage(incomingMsg);
    const hasDirectIntent = classification.intent === "direct_service";
    
    // 🔥 ESTRATÉGIA BASEADA EM CLASSIFICAÇÃO
    this.updateStrategyWithClassification(session, classification);
    
    logger.info("🎯 Primeira mensagem do cliente (CLASSIFICADA)", { 
      message: incomingMsg,
      intent: classification.intent,
      emotion: classification.emotion,
      riskLevel: classification.riskLevel,
      confidence: classification.confidence,
      hasDirectIntent,
      strategyLevel: session.strategyLevel
    });

    // Passar mensagem real do cliente + contexto de intenção
    this.addToHistory(session, {
      role: "user",
      content: incomingMsg,
      metadata: {
        isFirstInteraction: true,
        hasDirectIntent: hasDirectIntent,
        classification: classification
      }
    });

    // 🔥 Passar classificação para o LLM
    const classificationContext: ClassificationContext = {
      classification,
      isFirstInteraction: true,
      hasDirectIntent
    };

    const llmResponse = await generateWithTools(
      session.history, 
      session.state, 
      session.strategyLevel,
      classificationContext
    );
    const message = llmResponse.choices[0].message;

    this.addToHistory(session, message);

    const parsed = await this.safeParseWithRetry(message.content, session.state, session.strategyLevel);

    // APLICAR REGRAS DE GOVERNANÇA (Backend Authority)
    this.applyGovernanceRules(parsed, classification, session.strategyLevel);
    
    if (!hasDirectIntent) {
      parsed.followUpRequired = false;
    }

    // VALIDAR RESPOSTA (Post-processing enforcement)
    const validatedParsed = validateResponse(parsed, {
      hasDirectIntent: hasDirectIntent,
      intent: classification.intent,
      emotion: classification.emotion,
      isFirstInteraction: true,
      riskLevel: parsed.riskLevel,
      confidence: classification.confidence
    });
    
    logger.info("Resposta START validada", {
      messages: validatedParsed.messages,
      followUpRequired: validatedParsed.followUpRequired,
      hasDirectIntent: hasDirectIntent,
      violations: validatedParsed.violations.length
    });
    
    if (message.content && message.content.includes("Mia")) {
      session.hasIntroduced = true;
      session.presentationCount += 1;
    }

    session.state = ConversationState.WAITING_DOCUMENT;
    this.updateSession(session);

    if (validatedParsed.shouldTerminate) {
      this.resetSession(session.phoneNumber);
    }

    return validatedParsed;
  }
  // ================================
  // WAITING_DOCUMENT
  // ================================

  private async handleWaitingDocument(
    session: ConversationContext,
    incomingMsg: string
  ): Promise<HandleMessageOutput> {
    // 🔥 Na primeira interação do cliente (após START), passar isFirstInteraction
    // Nota: interactionCount já foi incrementado em handleMessage()
    const isFirstUserMessage = session.interactionCount === 1;

    // 🧠 CLASSIFICAÇÃO DETERMINÍSTICA PRIMEIRO
    const classification = classifyMessage(incomingMsg);
    
    // 🔥 ESTRATÉGIA BASEADA EM CLASSIFICAÇÃO
    this.updateStrategyWithClassification(session, classification);
    
    logger.info("🧠 Mensagem classificada", {
      phone: session.phoneNumber,
      intent: classification.intent,
      emotion: classification.emotion,
      riskLevel: classification.riskLevel,
      confidence: classification.confidence,
      strategyLevel: session.strategyLevel
    });

    // � POLICY: AGRESSIVIDADE = ENCERRAMENTO IMEDIATO
    // Nenhuma tolerância para abuso verbal (vai se fuder, xingamentos, etc)
    if (classification.emotion === "aggressive") {
      logger.error("🚨 ENCERRAMENTO IMEDIATO: Agressividade detectada", { 
        phone: session.phoneNumber,
        message: incomingMsg,
        confidence: (classification.confidence * 100).toFixed(0) + "%"
      });
      this.resetSession(session.phoneNumber);
      return {
        messages: [
          "Não é possível continuar a conversa com essa linguagem. Quando estiver pronto para uma conversa respeitosa, estarei aqui."
        ],
        riskLevel: "high",
        shouldTerminate: true,
        followUpRequired: false,
        strategyLevel: "firm"
      };
    }

    // �🔥 ESCALONAMENTO: Verificar limite de tentativas ANTES de processar
    if (session.attempts >= 3) {
      logger.warn("⚠️  Cliente atingiu limite de tentativas", { 
        phone: session.phoneNumber, 
        attempts: session.attempts,
        interactions: session.interactionCount
      });
      this.resetSession(session.phoneNumber);
      return {
        messages: [
          "Sem a confirmação do CPF não é possível prosseguir com o atendimento. Quando desejar continuar, estarei à disposição."
        ],
        riskLevel: "medium",
        shouldTerminate: true,
        followUpRequired: false,
        strategyLevel: "firm"
      };
    }

    // 🔥 RUÍDO CONTÍNUO: Se atingiu 6+ interações com ruído → encerrar
    if (session.interactionCount >= 6 && this.isNoise(incomingMsg)) {
      logger.warn("🚫 Encerramento por ruído contínuo", { 
        phone: session.phoneNumber,
        interactions: session.interactionCount
      });
      this.resetSession(session.phoneNumber);
      return {
        messages: [
          "Sem a confirmação do CPF não é possível prosseguir. Quando desejar continuar, estarei à disposição."
        ],
        riskLevel: "medium",
        shouldTerminate: true,
        followUpRequired: false,
        strategyLevel: "firm"
      };
    }

    this.addToHistory(session, {
      role: "user",
      content: incomingMsg,
      metadata: {
        isFirstUserMessage,
        classification
      }
    });

    // 🔍 DETECÇÃO DE TESTE DE LEGITIMIDADE: Perguntas sobre nome registrado
    if (classification.intent === "legitimacy_test") {
      const response = this.handleLegitimacyCheck(incomingMsg, session.strategyLevel);
      this.addToHistory(session, {
        role: "assistant",
        content: JSON.stringify(response)
      });
      return response;
    }

    // 🚨 DETECÇÃO DE SUSPEITA DE GOLPE: Cliente desconfiado mas legítimo
    if (classification.intent === "scam_suspicion") {
      const response = this.handleSuspiciousOfScam(session.strategyLevel);
      this.addToHistory(session, {
        role: "assistant",
        content: JSON.stringify(response)
      });
      return response;
    }

    // 😢 DETECÇÃO DE CONTEÚDO EMOCIONAL: Não mencionar CPF
    if (classification.intent === "emotional_share") {
      const response = this.handleEmotionalShare(classification.emotion);
      this.addToHistory(session, {
        role: "assistant",
        content: JSON.stringify(response)
      });
      return response;
    }

    // ❌ DETECÇÃO DE RESISTÊNCIA: Explorar motivo antes de pressionar
    if (classification.intent === "resistance") {
      const response = this.handleResistance(session, classification.emotion);
      this.addToHistory(session, {
        role: "assistant",
        content: JSON.stringify(response)
      });
      return response;
    }

    // 🔥 DETECÇÃO DE RUÍDO: Não chamar LLM, responder direto com tom escalonado
    if (this.isNoise(incomingMsg) || classification.intent === "casual_chat") {
      this.updateSession(session);
      
      // Escalonamento de tom baseado em interações
      const toneMessages = this.getEscalatedToneMessage(session.interactionCount);
      
      return {
        messages: [toneMessages],
        riskLevel: "medium",
        shouldTerminate: false,
        followUpRequired: true, // Manter em WAITING_DOCUMENT
        strategyLevel: session.strategyLevel
      };
    }

    // 🔥 Passar classificação para o LLM
    const classificationContext: ClassificationContext = {
      classification,
      isFirstInteraction: isFirstUserMessage,
      hasDirectIntent: classification.intent === "direct_service"
    };

    const llmResponse = await generateWithTools(
      session.history, 
      session.state, 
      session.strategyLevel,
      classificationContext
    );
    const message = llmResponse.choices[0].message;

    // 🔹 TOOL CALL
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];

      if (toolCall.type !== "function") {
        return this.genericError(session);
      }

      const args = JSON.parse(toolCall.function.arguments as string);
      const validation = validateDocument(args.document);

      this.addToHistory(session, message);

      this.addToHistory(session, {
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          valid: validation.isValid,
          isCPF: validation.isCPF
        })
      });

      const finalResponse = await generateWithTools(session.history, session.state, session.strategyLevel);
      const finalMessage = finalResponse.choices[0].message;

      this.addToHistory(session, finalMessage);

      const parsed = await this.safeParseWithRetry(finalMessage.content, session.state, session.strategyLevel);

      if (validation.isValid) {
        // 🔥 VALIDATED (bridge stage), não COMPLETED
        // Permite que o bot se prepare para apresentar proposta
        session.state = ConversationState.VALIDATED;
        logger.info("✅ Documento validado com sucesso", { 
          phone: session.phoneNumber,
          isCPF: validation.isCPF
        });
      } else {
        session.attempts += 1;
        this.updateStrategyLevel(session);
        logger.warn("❌ Documento inválido", { 
          phone: session.phoneNumber,
          attempts: session.attempts
        });
      }

      this.updateSession(session);

      if (parsed.shouldTerminate || session.attempts >= 3) {
        this.resetSession(session.phoneNumber);
      }

      return parsed;
    }

    // RESPOSTA NORMAL
    this.addToHistory(session, message);

    const parsed = await this.safeParseWithRetry(message.content, session.state, session.strategyLevel);

    // APLICAR REGRAS DE GOVERNANÇA (Backend Authority)
    this.applyGovernanceRules(parsed, classification, session.strategyLevel);

    // VALIDAR RESPOSTA (Post-processing enforcement)
    const validatedParsed = validateResponse(parsed, {
      hasDirectIntent: classification.intent === "direct_service",
      intent: classification.intent,
      emotion: classification.emotion,
      isFirstInteraction: isFirstUserMessage,
      riskLevel: parsed.riskLevel,
      confidence: classification.confidence
    });

    logger.info("Resposta WAITING_DOCUMENT validada", {
      messages: validatedParsed.messages,
      followUpRequired: validatedParsed.followUpRequired,
      isFirstUserMessage: isFirstUserMessage,
      violations: validatedParsed.violations.length
    });

    // Rastrear se apresentou nesta resposta
    if (message.content && message.content.includes("Mia")) {
      if (!session.hasIntroduced) {
        session.hasIntroduced = true;
        session.presentationCount += 1;
      } else if (session.presentationCount < 2) {
        session.presentationCount += 1;
      }
    }

    // AGRESSIVIDADE: Contabilizar respostas high-risk
    if (validatedParsed.riskLevel === "high") {
      session.attempts += 1;
      logger.warn("Risco alto detectado", { phone: session.phoneNumber, attempts: session.attempts });
      this.updateStrategyLevel(session);
    }

    this.updateSession(session);

    // ENCERRAMENTO: Se atingiu 2 mensagens agressivas, encerrar
    if (session.attempts >= 2 && validatedParsed.riskLevel === "high") {
      logger.error("Sessao encerrada por agressividade recorrente", { phone: session.phoneNumber });
      this.resetSession(session.phoneNumber);
      return {
        messages: [
          "Nao e possivel prosseguir nesse momento. Quando desejar continuar o atendimento de forma adequada, estarei disponivel."
        ],
        riskLevel: "high",
        shouldTerminate: true,
        followUpRequired: false,
        strategyLevel: "firm"
      };
    }

    if (validatedParsed.shouldTerminate || session.attempts >= 3) {
      this.resetSession(session.phoneNumber);
    }

    return validatedParsed;
  }

  // ================================
  // VALIDATED
  // ================================

  private async handleValidated(
    session: ConversationContext,
    incomingMsg: string
  ): Promise<HandleMessageOutput> {
    // 🔥 Estado de Bridge: validação concluída, aguardando próxima etapa
    // Nota: interactionCount já foi incrementado em handleMessage()

    logger.info("✅ Cliente em estado VALIDATED", { 
      phone: session.phoneNumber,
      interactionCount: session.interactionCount
    });

    this.addToHistory(session, {
      role: "user",
      content: incomingMsg
    });

    // Gerar resposta de confirmação + ponte para próxima etapa
    // O prompt será ajustado para estado VALIDATED
    const llmResponse = await generateWithTools(session.history, session.state, session.strategyLevel);
    const message = llmResponse.choices[0].message;

    this.addToHistory(session, message);

    const parsed = await this.safeParseWithRetry(message.content, session.state, session.strategyLevel);

    // 🔥 Transição automática para OFFER_STAGE após resposta
    session.state = ConversationState.OFFER_STAGE;

    this.updateSession(session);

    return parsed;
  }

  // ================================
  // OFFER_STAGE
  // ================================

  private async handleOfferStage(
    session: ConversationContext,
    incomingMsg: string
  ): Promise<HandleMessageOutput> {
    // 🔥 Estado de Apresentação: cliente validado, agora apresentar proposta
    session.interactionCount += 1;

    logger.info("📊 Cliente em estado OFFER_STAGE", { 
      phone: session.phoneNumber,
      interactionCount: session.interactionCount
    });

    this.addToHistory(session, {
      role: "user",
      content: incomingMsg
    });

    // Gerar resposta com proposta
    const llmResponse = await generateWithTools(session.history, session.state, session.strategyLevel);
    const message = llmResponse.choices[0].message;

    this.addToHistory(session, message);

    const parsed = await this.safeParseWithRetry(message.content, session.state, session.strategyLevel);

    this.updateSession(session);

    return parsed;
  }

  // ================================
  // COMPLETED
  // ================================

  private async handleCompleted(
    session: ConversationContext
  ): Promise<HandleMessageOutput> {
    const output: HandleMessageOutput = {
      messages: [
        "Sua validação já foi concluída. Caso deseje iniciar novo atendimento, envie nova mensagem."
      ],
      riskLevel: "low",
      shouldTerminate: true
    };

    this.resetSession(session.phoneNumber);
    return output;
  }

  // ================================
  // UTILITÁRIOS
  // ================================

  private safeParse(content: string | null | undefined): HandleMessageOutput {
    try {
      if (!content) {
        logger.warn("⚠️  Conteúdo vazio do LLM");
        return this.defaultErrorResponse();
      }

      logger.info("📝 Raw LLM response", { content });

      // 🔥 FIX #5: REGEX EXTRACTION PRIMEIRO (3 tentativas progressivas)
      
      // Tentativa 1: JSON puro entre chaves
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        // Tentativa 2: Extrair tudo após primeira chave aberta
        jsonMatch = content.match(/\{[\s\S]*/);
      }
      
      if (!jsonMatch) {
        // Tentativa 3: Buscar estrutura JSON com ```json wrapper
        const codeBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          jsonMatch = codeBlockMatch[1].match(/\{[\s\S]*\}/);
        }
      }
      
      if (!jsonMatch) {
        logger.error("❌ Nenhum JSON encontrado na resposta", { content });
        // Marcar para retry
        return {
          ...this.defaultErrorResponse(),
          _needsRetry: true,
          _originalContent: content
        } as HandleMessageOutput & { _needsRetry: boolean; _originalContent: string };
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        messages: parsed.messages || [],
        riskLevel: parsed.riskLevel || "low",
        shouldTerminate: parsed.shouldTerminate || false,
        followUpRequired: parsed.followUpRequired !== undefined ? parsed.followUpRequired : true,
        strategyLevel: parsed.strategyLevel || "balanced"
      };
    } catch (error) {
      logger.error("❌ Erro ao parsear JSON do LLM", { error, content });
      // Marcar para retry
      return {
        ...this.defaultErrorResponse(),
        _needsRetry: true,
        _originalContent: content
      } as HandleMessageOutput & { _needsRetry: boolean; _originalContent: string };
    }
  }

  /**
   * 🔧 Tenta reparar resposta JSON inválida via LLM
   * Faz 1 retry antes de retornar erro
   */
  private async safeParseWithRetry(
    content: string | null | undefined,
    state: ConversationState,
    strategyLevel: StrategyLevel
  ): Promise<HandleMessageOutput> {
    const firstAttempt = this.safeParse(content);
    
    // Se parseou corretamente, retorna
    if (!(firstAttempt as any)._needsRetry) {
      return firstAttempt;
    }

    logger.warn("🔄 FIX #5: Primeira tentativa OK (regex) falhou, tentando LLM repair (1 retry max)...", { 
      originalContent: content 
    });

    try {
      // 🔥 FIX #5: Tenta reparo via LLM apenas 1 vez (não loop)
      const repairResponse = await repairJsonResponse(
        content || "",
        state,
        strategyLevel
      );

      const repairedContent = repairResponse.choices[0].message.content;
      logger.info("🔧 Resposta reparada via LLM", { repairedContent });

      const secondAttempt = this.safeParse(repairedContent);

      // Se ainda falhou após LLM repair, retorna erro (sem mais retry)
      if ((secondAttempt as any)._needsRetry) {
        logger.error("❌ Reparo via LLM falhou também, retornando erro padrão (nenhum retry adicional)");
        return this.defaultErrorResponse();
      }

      logger.info("✅ JSON reparado com sucesso");
      return secondAttempt;
    } catch (error) {
      logger.error("❌ Erro ao chamar reparo JSON (limite de retry atingido)", { error });
      return this.defaultErrorResponse();
    }
  }

private defaultErrorResponse(): HandleMessageOutput {
  return {
    messages: [
      "Ocorreu um erro no processamento. Vamos reiniciar o atendimento."
    ],
    riskLevel: "low",
    shouldTerminate: true,
    followUpRequired: false
  };
}

// 🔥 ESCALONAMENTO DE TOM: Retorna mensagem apropriada conforme número de interações
// 🔥 ESCALONAMENTO DE TOM: Retorna mensagem apropriada conforme número de interações
private getEscalatedToneMessage(interactionCount: number): string {
  if (interactionCount <= 2) {
    // Primeira interação: educada e conversacional (SOFT)
    return "Pode me confirmar seu CPF para que eu continue?";
  } else if (interactionCount <= 4) {
    // Segunda/Terceira: mais direta (BALANCED)
    return "Preciso validar seu CPF antes de seguir com você.";
  } else if (interactionCount <= 5) {
    // Quarta: firme sem ser rude (BALANCED → FIRM)
    return "Sem validar o CPF, não consigo avançar.";
  } else {
    // Quinta+: tone final, objetivo puro (FIRM)
    return "Para continuar, confirme seu CPF.";
  }
}

// 🔍 RESPOSTA PADRÃO PARA TESTE DE LEGITIMIDADE
private handleLegitimacyCheck(message: string, strategyLevel: StrategyLevel): HandleMessageOutput {
  logger.info("🔍 Teste de legitimidade detectado", { message, strategyLevel });
  
  // Varia resposta conforme estratégia
  let messages: string[];
  
  if (strategyLevel === "soft") {
    messages = [
      "Ótima pergunta! Você está identificado como Pedro em nosso sistema.",
      "Para prosseguir, preciso confirmar seu CPF para garantir segurança."
    ];
  } else if (strategyLevel === "firm") {
    messages = [
      "Você está identificado como Pedro em nosso sistema.",
      "Confirme seu CPF para que eu continue."
    ];
  } else {
    // balanced
    messages = [
      "Você está identificado como Pedro em nosso sistema.",
      "Para prosseguir, preciso confirmar seu CPF."
    ];
  }
  
  return {
    messages,
    riskLevel: "low",
    shouldTerminate: false,
    followUpRequired: true,
    strategyLevel
  };
}

// 🚨 RESPOSTA PADRÃO PARA SUSPEITA DE GOLPE
private handleSuspiciousOfScam(strategyLevel: StrategyLevel): HandleMessageOutput {
  logger.info("🚨 Suspeita de golpe detectada", { strategyLevel });
  
  // Varia resposta conforme estratégia
  // 🔥 Usa nome do cliente UMA ÚNICA VEZ para humanizar
  let messages: string[];
  
  if (strategyLevel === "soft") {
    messages = [
      "Faz total sentido você questionar. Segurança é prioridade nossa também.",
      "Pode confirmar nossa autenticidade pelos canais oficiais do Banco Nova Era. Quando se sentir seguro, poderei validar seu CPF com você."
    ];
  } else if (strategyLevel === "firm") {
    messages = [
      "Você pode validar nossos canais oficiais do Banco Nova Era.",
      "Quando estiver seguro, confirme seu CPF para continuar."
    ];
  } else {
    // balanced - USO ESTRATÉGICO DE NOME
    messages = [
      "É uma pergunta justa. Segurança vem em primeiro lugar.",
      "Pode confirmar a autenticidade deste contato pelos canais oficiais do Banco Nova Era. Quando se sentir seguro, poderei validar seu CPF."
    ];
  }
  
  return {
    messages,
    riskLevel: "medium",
    shouldTerminate: false,
    followUpRequired: false,
    strategyLevel
  };
}

// 😢 RESPOSTA PARA CONTEÚDO EMOCIONAL
private handleEmotionalShare(emotion: UserEmotion): HandleMessageOutput {
  logger.info("😢 Conteúdo emocional detectado", { emotion });
  
  // Respostas empáticas que NÃO mencionam CPF
  const empathyResponses = [
    "Nossa... sinto muito mesmo. Quer falar sobre isso?",
    "Puxa, isso é difícil. Tô aqui se precisar.",
    "Sinto muito por isso. Como posso ajudar?",
    "Que situação... espero que fique tudo bem."
  ];
  
  // Escolhe resposta aleatória para variar
  const randomIndex = Math.floor(Math.random() * empathyResponses.length);
  
  return {
    messages: [empathyResponses[randomIndex]],
    riskLevel: "low",
    shouldTerminate: false,
    followUpRequired: false, // NÃO pressionar por CPF após emoção
    strategyLevel: "soft"
  };
}

// ❌ RESPOSTA PARA RESISTÊNCIA (Explorar motivo antes de pressionar)
private handleResistance(session: ConversationContext, emotion: UserEmotion): HandleMessageOutput {
  // 🔥 FIX #2: Incrementar contador de resistência
  session.resistanceCount += 1;
  
  logger.info("❌ Resistência detectada", { 
    emotion, 
    resistanceCount: session.resistanceCount,
    interactionCount: session.interactionCount,
    strategyLevel: session.strategyLevel 
  });
  
  // 🎯 RESISTÊNCIA #1: EXPLORAR motivo (primeira vez)
  if (session.resistanceCount === 1) {
    const exploratoryResponses = [
      "Posso perguntar o que te deixou desconfortável com isso?",
      "É receio de segurança ou prefere entender melhor o motivo?",
      "Algo te preocupa? Me conta que eu explico."
    ];
    
    const randomIndex = Math.floor(Math.random() * exploratoryResponses.length);
    
    return {
      messages: [exploratoryResponses[randomIndex]],
      riskLevel: "medium",
      shouldTerminate: false,
      followUpRequired: false, // Deixe cliente responder
      strategyLevel: "soft"
    };
  }
  
  // 🎯 RESISTÊNCIA #2: EXPLORAR DIFERENTE (segunda tentativa, ângulo novo)
  if (session.resistanceCount === 2) {
    // Variar ângulo totalmente - não é pergunta, é atestação
    const alternativeResponses = [
      "Entendi sua preocupação. Você pode confirmar nossos canais oficiais antes.",
      "Faz sentido questionar. Segurança em primeiro lugar. Quando se sentir seguro, me envia.",
      "Totalmente válido. Pode validar conosco depois, sem pressa."
    ];
    
    const randomIndex = Math.floor(Math.random() * alternativeResponses.length);
    
    return {
      messages: [alternativeResponses[randomIndex]],
      riskLevel: "medium",
      shouldTerminate: false,
      followUpRequired: false, // Ainda deixe cliente decidir
      strategyLevel: "balanced"
    };
  }
  
  // 🎯 RESISTÊNCIA #3+: FIRM BOUNDARY (limite respeitoso mas assertivo)
  // Após 2+ tentativas de exploração, estabelecer limite claro
  return {
    messages: [
      "Sem a confirmação do CPF não consigo avançar com você.",
      "Quando desejar continuar, estarei à disposição."
    ],
    riskLevel: "medium",
    shouldTerminate: false,
    followUpRequired: false,
    strategyLevel: "firm"
  };
}

private isNoise(message: string): boolean {
  const cleaned = message.trim().toLowerCase();

  // Mensagens muito curtas são ruído
  if (cleaned.length < 3) return true;

  // Padrão regex: apenas letras/números repetidos com até 4 caracteres
  // Exemplos: "kkkk", "aaaa", "1234", "nn", "pogrr", "xyz"
  const noiseRegex = /^[a-z0-9]{1,4}$/;
  if (noiseRegex.test(cleaned)) return true;

  // Padrões específicos com significado zero
  const noisePatterns = [
    "aaa", "kkkk", "para", "zaaa", "apaga", "nada a ver",
    "blá", "ué", "haha", "rsrs", "hehe", "kkk"
  ];

  return noisePatterns.some(p => cleaned.includes(p));
}

  private genericError(session: ConversationContext): HandleMessageOutput {
    this.resetSession(session.phoneNumber);

    return {
      messages: ["Ocorreu um erro inesperado."],
      riskLevel: "low",
      shouldTerminate: true
    };
  }
}

export const conversationManager = new ConversationManager();