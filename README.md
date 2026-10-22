# Ruffino Finanças

Aplicativo de controle financeiro pessoal e da empresa, na identidade visual da Lilian Ruffino Consultoria Empresarial.
Funciona no navegador (computador e celular), pode ser instalado como app (PWA) e também é gerado como APK Android.

## O que faz

- **Início**: saldo geral e previsto, receitas e despesas do mês, contas, cartões, gastos por categoria, pendências, objetivos e dica do dia.
- **Transações**: despesas, receitas, transferências e compras no cartão; parceladas e fixas (todo mês); busca, filtros e marcação de pago/pendente.
- **Cartões de crédito**: fatura calculada pelo dia de fechamento, limite disponível, pagamento total ou parcial.
- **Compras parceladas no cartão**: ficam dentro de cada cartão. A fatura recebe só a parcela do mês (resumo à vista × parcelas × ajustes), o restante ocupa o limite. Compra que já estava em andamento é cadastrada pela parcela que aparece na fatura (ex.: 04/10): as anteriores ficam só no histórico, fora das faturas, do limite e dos relatórios.
- **Parcelamentos com pessoas e lojas** (guia própria): carnês, crediários, Pix parcelado e acordos com pessoas físicas, a pagar ou a receber. Totais por pessoa, parcelas atrasadas, pagamento parcela a parcela escolhendo conta, valor real (juros/desconto) e data, e quitação antecipada.
- **Planejamento**: limite mensal por categoria, alertas de estouro e sugestão pela média dos últimos 3 meses.
- **Objetivos**: metas com prazo, depósitos e quanto guardar por mês.
- **Relatórios**: DRE simplificado do mês, receitas x despesas (6 meses), categorias e evolução do saldo; envio do resumo pelo WhatsApp.
- **Pessoal x Empresa**: cada conta/cartão é marcado como PF ou PJ, e todas as telas filtram por escopo.
- **Segurança e dados**: PIN de 4 dígitos, tema claro/escuro, backup/restauração em JSON e exportação CSV.
- **Lançar pela notificação/SMS**: cole a mensagem do banco (Nubank, Inter, BB, C6, Bradesco, Santander, Itaú, Caixa, Neon, Digio, Sicoob…) e o lançamento sai preenchido com valor, estabelecimento, data e tipo.
- **Cartões avançados**: melhor cartão para comprar hoje, estorno, ajuste de fatura, antecipação de parcelas e fatura paga parcialmente.
- **Planejamento por mês**: meta geral, % de alerta configurável, limites por subcategoria; cada mês herda o plano anterior.
- **Organização**: subcategorias, arquivar contas/cartões/categorias, ignorar transações nos relatórios, tags com totais, modo viagem, calendário e filtros avançados.
- **Automação**: efetivar pendências no vencimento, alerta de despesa acima da média, reajuste de saldo e mover lançamentos entre contas.
- **Importação e comprovantes**: extrato OFX/CSV com prévia e detecção de duplicados; foto ou PDF do comprovante em cada lançamento (guardado no aparelho, fora do backup JSON).

Os dados ficam guardados no aparelho (armazenamento local do navegador/app) e, opcionalmente, na nuvem pelo Supabase. Faça backup pela tela Configurações.

## Sincronização na nuvem (Supabase) — usar em vários aparelhos

O app continua funcionando offline; a nuvem é uma cópia sincronizada. Cada usuário tem uma linha na tabela `app_state` com os dados do app em JSON, protegida por RLS (cada conta só enxerga a própria linha). Cada envio sobe a versão (`rev`): se outro aparelho salvou antes, nada é sobrescrito e o app pergunta qual versão manter.

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No painel: **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** (nunca use a `service_role` no app).
4. Opcional: em **Authentication → Sign In / Providers → Email**, desligue “Confirm email” para não precisar confirmar o e-mail ao criar a conta.
5. No app: **Mais → Configurações → Sincronização na nuvem → Configurar Supabase**, cole a URL e a chave, depois **Criar conta** (primeiro aparelho) ou **Entrar** (demais).
   Num aparelho novo, a tela de boas-vindas tem o botão **Já uso em outro aparelho**.

Para não digitar a URL/chave em cada aparelho, deixe-as fixas no build:
- local: copie `.env.example` para `.env.local` e preencha;
- GitHub Actions: crie os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (os workflows já os repassam ao build).

A chave anon é pública por natureza (vai dentro do app); quem protege os dados é o RLS do script.
Comprovantes (fotos/PDF) continuam só no aparelho; para levá-los à nuvem, o próximo passo seria o Supabase Storage.

## Desenvolvimento

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a versão de produção em dist/
npm run icons    # regenera ícones a partir de src/brand.js
```

## Publicação

- `.github/workflows/pages.yml` publica a versão web no GitHub Pages a cada push na `main`.
- `.github/workflows/android.yml` gera o APK (Capacitor) e o publica em **Releases → apk-latest**.
  Com os secrets `ANDROID_KEYSTORE_BASE64` e `ANDROID_KEYSTORE_PASSWORD`, o APK sai assinado sempre com a mesma chave,
  e as atualizações instalam por cima sem perder os dados.
