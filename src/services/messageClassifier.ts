/**
 * 🧠 MESSAGE CLASSIFIER (Deterministic Layer)
 * 
 * Separação de responsabilidades:
 * - Classificação → Determinística (regex + heurística + keywords)
 * - Geração → LLM
 * 
 * Este módulo classifica ANTES do LLM processar,
 * garantindo consistência e previsibilidade.
 */

// ================================
// TYPES
// ================================

export type UserIntent = 
  | "greeting"           // Saudação simples (oi, bom dia)
  | "direct_service"     // Intenção direta de serviço (quero empréstimo)
  | "question"           // Pergunta sobre serviço/processo
  | "legitimacy_test"    // Teste de legitimidade (qual meu nome?)
  | "scam_suspicion"     // Suspeita de golpe
  | "resistance"         // Resistência a validação (não quero passar)
  | "document_attempt"   // Tentativa de enviar documento
  | "emotional_share"    // Compartilhamento emocional
  | "casual_chat"        // Conversa casual (kk, brabo)
  | "unknown";           // Não classificado

export type UserEmotion =
  | "neutral"            // Sem emoção clara
  | "positive"           // Positivo, amigável
  | "curious"            // Curioso, fazendo perguntas
  | "suspicious"         // Desconfiado, cauteloso
  | "frustrated"         // Frustrado, impaciente
  | "aggressive"         // Agressivo, hostil
  | "emotional"          // Emocional (tristeza, vulnerabilidade)
  | "playful";           // Brincalhão, casual

export type RiskLevel = "low" | "medium" | "high";

export interface MessageClassification {
  intent: UserIntent;
  emotion: UserEmotion;
  riskLevel: RiskLevel;
  confidence: number; // 0-1
  signals: string[];  // Sinais detectados para debug
}

// ================================
// INTENT CLASSIFICATION
// ================================

export function classifyIntent(message: string): UserIntent {
  const clean = message.toLowerCase().trim();
  
  // 🔥 DOCUMENT ATTEMPT - Prioridade máxima
  if (isDocumentAttempt(clean)) {
    return "document_attempt";
  }
  
  // 🚨 SCAM SUSPICION
  if (isScamSuspicion(clean)) {
    return "scam_suspicion";
  }
  
  // 🔍 LEGITIMACY TEST
  if (isLegitimacyTest(clean)) {
    return "legitimacy_test";
  }
  
  // ❌ RESISTANCE
  if (isResistance(clean)) {
    return "resistance";
  }
  
  // 💰 DIRECT SERVICE INTENT
  if (hasDirectServiceIntent(clean)) {
    return "direct_service";
  }
  
  // 😢 EMOTIONAL SHARE
  if (isEmotionalShare(clean)) {
    return "emotional_share";
  }
  
  // 👋 GREETING (antes de casual_chat para capturar "oi", "olá", etc)
  if (isGreeting(clean)) {
    return "greeting";
  }
  
  // ❓ QUESTION
  if (isQuestion(clean)) {
    return "question";
  }
  
  // 💬 CASUAL CHAT (depois de greeting para não capturar saudações)
  if (isCasualChat(clean)) {
    return "casual_chat";
  }
  
  return "unknown";
}

// ================================
// EMOTION CLASSIFICATION
// ================================

export function classifyEmotion(message: string): UserEmotion {
  const clean = message.toLowerCase().trim();
  
  // 😡 AGGRESSIVE
  if (isAggressive(clean)) {
    return "aggressive";
  }
  
  // 😢 EMOTIONAL
  if (isEmotionalContent(clean)) {
    return "emotional";
  }
  
  // 😤 FRUSTRATED
  if (isFrustrated(clean)) {
    return "frustrated";
  }
  
  // 🤨 SUSPICIOUS
  if (isSuspicious(clean)) {
    return "suspicious";
  }
  
  // 😄 PLAYFUL
  if (isPlayful(clean)) {
    return "playful";
  }
  
  // 🤔 CURIOUS
  if (isCurious(clean)) {
    return "curious";
  }
  
  // 😊 POSITIVE
  if (isPositive(clean)) {
    return "positive";
  }
  
  return "neutral";
}

// ================================
// RISK CLASSIFICATION
// ================================

export function classifyRisk(message: string, emotion: UserEmotion, intent: UserIntent): RiskLevel {
  const clean = message.toLowerCase().trim();
  
  // � FIX #3: GREETING EXCEPTION - Saudações simples nunca são medium/high
  // Uma saudação como "oi" não pode gerar over-governance por confidence baixo
  if (intent === "greeting") {
    return "low";
  }
  
  // �🔴 HIGH RISK
  if (emotion === "aggressive") {
    return "high";
  }
  
  if (hasHighRiskIndicators(clean)) {
    return "high";
  }
  
  // 🟡 MEDIUM RISK
  if (intent === "scam_suspicion" || intent === "resistance") {
    return "medium";
  }
  
  if (emotion === "frustrated" || emotion === "suspicious") {
    return "medium";
  }
  
  if (hasMediumRiskIndicators(clean)) {
    return "medium";
  }
  
  // 🟢 LOW RISK
  return "low";
}

// ================================
// FULL CLASSIFICATION
// ================================

export function classifyMessage(message: string): MessageClassification {
  const signals: string[] = [];
  
  const intent = classifyIntent(message);
  signals.push(`intent:${intent}`);
  
  const emotion = classifyEmotion(message);
  signals.push(`emotion:${emotion}`);
  
  const riskLevel = classifyRisk(message, emotion, intent);
  signals.push(`risk:${riskLevel}`);
  
  // Confidence baseada em quão claro é o sinal
  const confidence = calculateConfidence(message, intent, emotion);
  
  return {
    intent,
    emotion,
    riskLevel,
    confidence,
    signals
  };
}

// ================================
// HELPER FUNCTIONS - INTENT
// ================================

function isDocumentAttempt(clean: string): boolean {
  // CPF: 11 dígitos (com ou sem formatação)
  const cpfPattern = /\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/;
  const cpfOnlyDigits = /^\d{11}$/;
  
  // CNPJ: 14 dígitos (com ou sem formatação)
  const cnpjPattern = /\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\.\s]?\d{4}[-\.\s]?\d{2}/;
  const cnpjOnlyDigits = /^\d{14}$/;
  
  return cpfPattern.test(clean) || 
         cpfOnlyDigits.test(clean.replace(/\D/g, '')) ||
         cnpjPattern.test(clean) ||
         cnpjOnlyDigits.test(clean.replace(/\D/g, ''));
}

function isScamSuspicion(clean: string): boolean {
  const exactTerms = [
    "isso é golpe",
    "é golpe",
    "golpe",
    "quer me enganar",
    "não acredito",
    "desconfiado",
    "suspeito",
    "fraude",
    "me enganar",
    "enganação"
  ];
  
  if (exactTerms.some(t => clean.includes(t))) {
    return true;
  }
  
  const patterns = [
    /como\s+(eu\s+)?sei\s+que\s+(é|você|sou)/,
    /como\s+(eu\s+)?sei\s+que\s+é\s+válido/,
    /por\s+que\s+ped(ir)?\s+(cpf|cnpj|seu|meu)/,
    /por\s+que\s+voc(ê|ês)\s+(quer|querem)/,
    /é\s+seguro|posso\s+confiar/
  ];
  
  return patterns.some(p => p.test(clean));
}

function isLegitimacyTest(clean: string): boolean {
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
    "identifique-se",
    "quem é você",
    "quem é vc"
  ];
  
  return terms.some(t => clean.includes(t));
}

function isResistance(clean: string): boolean {
  const patterns = [
    /não\s+quero/,
    /prefiro\s+não/,
    /não\s+vou\s+passar/,
    /não\s+vou\s+dar/,
    /não\s+confio/,
    /não\s+passo/,
    /recuso/,
    /me\s+recuso/,
    /não\s+envio/
  ];
  
  const terms = [
    "receio",
    "tenho medo",
    "não quero",
    "prefiro não",
    "nunca vou passar",
    "não confio"
  ];
  
  return patterns.some(p => p.test(clean)) || terms.some(t => clean.includes(t));
}

function hasDirectServiceIntent(clean: string): boolean {
  const patterns = [
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
  
  return patterns.some(p => p.test(clean));
}

function isEmotionalShare(clean: string): boolean {
  const terms = [
    "faleceu",
    "morreu",
    "morrendo",
    "deprimido",
    "depressão",
    "ansiedade",
    "ansioso",
    "triste",
    "chorando",
    "trauma",
    "doente",
    "hospital",
    "câncer",
    "acidente",
    "problema grave",
    "não aguento mais",
    "desesperado"
  ];
  
  return terms.some(t => clean.includes(t));
}

function isQuestion(clean: string): boolean {
  const questionMarkers = [
    "?",
    "qual",
    "como",
    "o que",
    "por que",
    "porque",
    "quando",
    "onde",
    "quem",
    "quanto"
  ];
  
  // Tem marcador de pergunta mas não é golpe/legitimidade
  return questionMarkers.some(m => clean.includes(m));
}

function isCasualChat(clean: string): boolean {
  const terms = [
    "kk",
    "kkk",
    "haha",
    "rsrs",
    "hehe",
    "brabo",
    "top",
    "show",
    "blz",
    "beleza",
    "dahora",
    "massa",
    "valeu",
    "tmj",
    "firmeza"
  ];
  
  return terms.some(t => clean.includes(t)) || clean.length < 5;
}

function isGreeting(clean: string): boolean {
  const greetings = [
    "oi",
    "olá",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "eae",
    "e aí",
    "fala",
    "hello",
    "hi"
  ];
  
  return greetings.some(g => clean.startsWith(g) || clean === g);
}

// ================================
// HELPER FUNCTIONS - EMOTION
// ================================

function isAggressive(clean: string): boolean {
  // TIER 1: Abuso verbal direto (prioridade maxima)
  // Padroes para capturar variacoes de xingamentos
  const abusivePatterns = [
    // Expressoes com foder/fuder (variacoes: foder, fuder, f*der, etc)
    /vai\s+(se\s+)?(f[o|u]der|fuder|fud[ir])/,
    // FDP e variacoes
    /(f\.?d\.?p|fdp|filho\s+da\s+puta|filha\s+da\s+puta)/,
    // Caralho e variacoes
    /(caralho|caramba|caralhada)/,
    // Merda
    /\bmerda\b/,
    // Burro/Imbecil/Idiota
    /(imbecil|idiota|burro|retardado|debil)/,
    // Xingamentos gerais
    /(cala\s+a\s+boca|cale-se|seu\s+.*\s+(lixo|porcaria|viadinho|gay))/
  ];

  // TIER 2: Agressividade contextual
  // Tom agressivo mesmo sem xingamento exato
  const aggressiveIntent = [
    /vai\s+embora/,
    /some\s+daqui/,
    /me\s+deixa\s+em\s+paz/,
    /para\s+de\s+encher/,
    /nao\s+te\s+dou/,
    /você\s+é\s+um\s+(mentiroso|fraudador|enganador|bandido)/,
    /vou\s+(denunciar|procesar|ir\s+na\s+policia)/,
    /processo\s+(judicial|na\s+justica|trabalhista)/
  ];

  // TIER 3: Com-insultos/ataques pessoais combinados
  const combinedAttack = [
    /você\s+(é|sao|ta)\s+(burro|idiot|retardad)/,
    /nao\s+(aguento|aguento\s+mais).*pedir.*cpf/
  ];

  const isTier1 = abusivePatterns.some(p => p.test(clean));
  const isTier2 = aggressiveIntent.some(p => p.test(clean));
  const isTier3 = combinedAttack.some(p => p.test(clean));

  return isTier1 || isTier2 || isTier3;
}

function isEmotionalContent(clean: string): boolean {
  const terms = [
    "triste",
    "chorando",
    "deprimido",
    "ansioso",
    "medo",
    "preocupado",
    "angustiado",
    "desesperado",
    "sozinho",
    "abandonado"
  ];
  
  return terms.some(t => clean.includes(t));
}

function isFrustrated(clean: string): boolean {
  const patterns = [
    /já\s+falei/,
    /já\s+disse/,
    /de\s+novo/,
    /outro\s+vez/,
    /não\s+entende/,
    /não\s+escuta/,
    /poxa/,
    /putz/,
    /af+/,
    /cansado/,
    /impaciente/
  ];
  
  const terms = [
    "de novo",
    "outra vez",
    "já falei",
    "já disse",
    "cansado disso",
    "chega",
    "basta"
  ];
  
  return patterns.some(p => p.test(clean)) || terms.some(t => clean.includes(t));
}

function isSuspicious(clean: string): boolean {
  const terms = [
    "desconfio",
    "desconfiado",
    "suspeito",
    "estranho",
    "esquisito",
    "duvidoso",
    "será que",
    "certeza",
    "confirmar"
  ];
  
  return terms.some(t => clean.includes(t));
}

function isPlayful(clean: string): boolean {
  const terms = [
    "kk",
    "haha",
    "rsrs",
    "hehe",
    "brincadeira",
    "zueira",
    "zoeira",
    "brabo",
    "fera",
    "top"
  ];
  
  return terms.some(t => clean.includes(t));
}

function isCurious(clean: string): boolean {
  const patterns = [
    /como.*funciona/,
    /o\s+que.*é/,
    /por\s+que/,
    /qual.*diferença/,
    /explica/,
    /me.*cont(a|e)/
  ];
  
  return patterns.some(p => p.test(clean)) || clean.includes("?");
}

function isPositive(clean: string): boolean {
  const terms = [
    "obrigado",
    "agradeço",
    "perfeito",
    "ótimo",
    "excelente",
    "maravilha",
    "show",
    "top",
    "massa",
    "legal",
    "beleza",
    "combinado",
    "fechado"
  ];
  
  return terms.some(t => clean.includes(t));
}

// ================================
// HELPER FUNCTIONS - RISK
// ================================

function hasHighRiskIndicators(clean: string): boolean {
  const terms = [
    "vai se foder",
    "fdp",
    "imbecil",
    "processo",
    "procon",
    "advogado",
    "denunciar",
    "polícia"
  ];
  
  return terms.some(t => clean.includes(t));
}

function hasMediumRiskIndicators(clean: string): boolean {
  const terms = [
    "golpe",
    "fraude",
    "não confio",
    "desconfiado",
    "suspeito",
    "pra que cpf",
    "não quero passar"
  ];
  
  return terms.some(t => clean.includes(t));
}

// ================================
// CONFIDENCE CALCULATION
// ================================

function calculateConfidence(message: string, intent: UserIntent, emotion: UserEmotion): number {
  const clean = message.toLowerCase().trim();
  
  // AGGRESSIVE = MAXIMA CONFIANCA (nunca cai em governance fallback)
  // Isso eh critico: se classificamos como agressivo, confianca deve ser 1.0
  if (emotion === "aggressive") {
    return 1.0;
  }
  
  // Mensagens muito curtas = baixa confianca
  if (clean.length < 3) {
    return 0.3;
  }
  
  // Intent unknown = baixa confianca
  if (intent === "unknown") {
    return 0.4;
  }
  
  // Sinais claros = alta confianca
  if (intent === "document_attempt" || intent === "scam_suspicion" || intent === "legitimacy_test") {
    return 0.95;
  }
  
  if (intent === "direct_service" && clean.length > 10) {
    return 0.9;
  }
  
  if (intent === "greeting" && clean.length < 15) {
    return 0.85;
  }
  
  // Padrao
  return 0.7;
}
