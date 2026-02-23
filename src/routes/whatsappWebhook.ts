import { Router, Request, Response } from "express";
import { conversationManager } from "../state/conversationManager";
import { logger } from "../utils/logger";

const router = Router();

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;

    // Validação mínima
    if (!phone || !message) {
      logger.warn("Webhook recebido com payload inválido", {
        body: req.body
      });
      return res.status(400).json({
        error: "Missing required fields: phone and message"
      });
    }

    logger.info("Mensagem recebida", {
      phone,
      message
    });

    // Orquestração central
    const response = await conversationManager.handleMessage({
      phone: phone.toString(),
      message: message.toString().trim()
    });

    logger.info("Resposta gerada", {
      phone,
      riskLevel: response.riskLevel,
      state: conversationManager.getSession(phone)?.state,
      messages: response.messages.length
    });

    return res.json({
      success: true,
      riskLevel: response.riskLevel,
      messages: response.messages
    });

  } catch (error) {
    logger.error("Erro no webhook", {
      error: error instanceof Error ? error.message : String(error)
    });

    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

export default router;