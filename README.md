# Ruffino Finanças

Aplicativo de controle financeiro pessoal e da empresa, na identidade visual da Lilian Ruffino Consultoria Empresarial.
Funciona no navegador (computador e celular), pode ser instalado como app (PWA) e também é gerado como APK Android.

## O que faz

- **Início**: saldo geral e previsto, receitas e despesas do mês, contas, cartões, gastos por categoria, pendências, objetivos e dica do dia.
- **Transações**: despesas, receitas, transferências e compras no cartão; parceladas e fixas (todo mês); busca, filtros e marcação de pago/pendente.
- **Cartões de crédito**: fatura calculada pelo dia de fechamento, limite disponível, pagamento total ou parcial.
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

Os dados ficam guardados **somente no aparelho** (armazenamento local do navegador/app). Faça backup pela tela Configurações.

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
