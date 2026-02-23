import fs from "fs";
import path from "path";
import Handlebars from "handlebars";
import { ConversationState } from "../types/conversation";

const templatePath = path.join(__dirname, "../templates/systemPrompt.hbs");
const templateSource = fs.readFileSync(templatePath, "utf-8");

const template = Handlebars.compile(templateSource);

export function renderSystemPrompt(context: any) {
  // Adiciona o STATE ao contexto se não estiver presente
  return template({
    ...context,
    STATE: context.STATE || ConversationState.START
  });
}