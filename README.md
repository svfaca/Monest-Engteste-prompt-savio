# Teste - Engenheiro de Prompt

## O Contexto

Você está desenvolvendo um fluxo de conversa para a **Mia**, uma IA de vendas do Banco Nova Era que interage com clientes via WhatsApp.

Antes de oferecer qualquer produto, a Mia precisa validar se está falando com o cliente correto.

**Dados disponíveis no template:**
```json
{
  "companyName": "Banco Nova Era",
  "clientName": "Pedro Silva",
  "firstName": "Pedro",
  "isCPF": true
}
```

**Tool disponível:**
```json
{
  "title": "validate_customer",
  "description": "Valida informações de um cliente.",
  "properties": {
    "document": {
      "type": "string",
      "description": "CPF ou CNPJ, sem formatação."
    }
  },
  "required": ["document"]
}
```

---

## O que você precisa entregar

### 1. Fluxo de conversa
Planeje o fluxo completo: introdução, validação de identidade, tratamento de erros, encerramento.

Pode ser fluxograma, texto estruturado, ou outro formato visual.

### 2. Prompt em Handlebars
Mostre o prompt com variáveis (antes de renderizar) e o prompt final (após renderizar com os dados acima).

Use lógica condicional para alternar entre CPF e CNPJ baseado em `isCPF`.

### 3. Cenários de teste
Simule pelo menos 3 cenários:
- Cliente fornece documento válido
- Cliente fornece documento inválido
- Cliente não responde ou desvia

### 4. Gestão de riscos
Liste problemas que podem acontecer e como a Mia deve lidar com eles.

### 5. Refinamento pós-lançamento
Como você ajustaria o fluxo se, após lançar, descobrisse que 30% dos clientes abandonam na etapa de validação?

---

## Formato de entrega

Pode ser documento escrito, vídeo, apresentação — o que preferir. O importante é mostrar seu raciocínio.

Envie para [matheus.morett@monest.com.br](mailto:matheus.morett@monest.com.br) com o assunto **Teste Prompt Engineer - Monest**.

---

## O que avaliamos

- **Clareza**: O fluxo é fácil de entender?
- **Personalização**: Usou bem as variáveis do template?
- **Tratamento de edge cases**: Pensou nos desvios?
- **Raciocínio**: Conseguimos entender por que você tomou cada decisão?

---

## Dicas

- A conversa deve ser curta e objetiva. Tom amigável, mas profissional.
- Nem todo cliente vai seguir o caminho feliz. Planeje pra isso.
- Fique à vontade pra sugerir melhorias na tool, nos dados, ou no fluxo.