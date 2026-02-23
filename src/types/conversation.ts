export enum ConversationState {
  START = "START",
  WAITING_DOCUMENT = "WAITING_DOCUMENT",
  VALIDATED = "VALIDATED",           // 🔥 Novo: após validação bem-sucedida (bridge stage)
  OFFER_STAGE = "OFFER_STAGE",       // 🔥 Novo: apresentar proposta (próximo fluxo)
  COMPLETED = "COMPLETED"
}

export type StrategyLevel = "soft" | "balanced" | "firm";

export interface ConversationContext {
  phoneNumber: string;
  state: ConversationState;
  attempts: number;
  interactionCount: number; // 🔥 Contador total de mensagens do usuário
  resistanceCount: number; // 🔥 Contador específico de resistência (para variar exploração)
  strategyLevel: StrategyLevel; // 🔥 Modo comportamental dinâmico
  hasIntroduced: boolean; // 🔥 Flag para rastrear se já se apresentou
  presentationCount: number; // 🔥 Contar quantas vezes se apresentou (max 2 vezes naturalmente)
  history: any[];
  lastInteraction: number;
}