import dotenv from "dotenv";
import readline from "readline";
import { conversationManager } from "./state/conversationManager";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const phone = "test-user-" + Date.now();

console.log("\n" + "=".repeat(50));
console.log("🤖 MIA CLI TEST - Conversa Interativa");
console.log("=".repeat(50) + "\n");
console.log("Digite suas mensagens para testar o fluxo de conversa.");
console.log("Digite 'exit' para sair.\n");

async function promptUser() {
  rl.question("👤 Você: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("\n✅ Teste encerrado.\n");
      rl.close();
      process.exit(0);
    }

    try {
      const result = await conversationManager.handleMessage({
        phone,
        message: input
      });

      console.log("\n---\n");
      result.messages.forEach((msg, idx) => {
        console.log(`🤖 Mia [${idx + 1}]: ${msg}`);
      });
      console.log(`\n[riskLevel: ${result.riskLevel}, shouldTerminate: ${result.shouldTerminate}]\n`);

      if (result.shouldTerminate) {
        console.log("⚠️  Sessão encerrada pelo sistema.\n");
        rl.close();
        process.exit(0);
      }

      promptUser();
    } catch (error) {
      console.error("\n❌ Erro:", (error as Error).message);
      promptUser();
    }
  });
}

promptUser();
