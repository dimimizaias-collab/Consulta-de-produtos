# CLAUDE.md — App Consulta de Produtos

## Deploy Automático com Coolify e DNS Manual

Este workflow automatiza o deploy da aplicação em uma VPS usando o Coolify, com a configuração de DNS feita manualmente na Hostinger.

### Pré-requisitos
- Repositório GitHub remoto atualizado.
- **Dockerfile** na raiz do projeto ou subpasta.
- IP da VPS e UUIDs do Servidor/Projeto Coolify (buscar via MCP do Coolify).

### Passos do Workflow

#### 1. Sincronização com GitHub
Garantir que o código local está no GitHub.
```powershell
git add .
git commit -m "Preparando para deploy"
git push origin main
```

#### 2. Criar Aplicação no Coolify
Se for um novo app:
1. Usar `coolify-mcp_application` com `action='create_github'`.
2. Configuração: `build_pack='dockerfile'`, `ports_exposes='80'`.

#### 3. Deploy Inicial
1. Iniciar o deploy com `coolify-mcp_deploy`.
2. Monitorar via `coolify-mcp_deployment` até o status `finished`.

#### 4. Configurar DNS Manual (Hostinger)
**Ação do Usuário** — como o MCP da Hostinger não está disponível:
1. Acessar o Painel da Hostinger → DNS / Nameservers.
2. Criar um **Registro tipo A**.
3. **Nome**: o subdomínio (ex: `app`) ou `@` para o domínio principal.
4. **Aponta para (IP)**: o IP da VPS (informar ao usuário qual é).

#### 5. Configurar Domínio e SSL no Coolify
1. Tentar atualizar o campo `fqdn` automaticamente via `coolify-mcp_application`.
2. **Fallback Proativo**: se a atualização automática falhar, avisar o usuário imediatamente e fornecer o link direto para a página de configuração do App no Coolify:
   ```
   https://[IP-DA-VPS]:8000/project/[PROJECT-UUID]/environment/[ENV-NAME]/application/[APP-UUID]#configuration
   ```
3. **Ação Manual**: no campo **Domains**, colar a URL completa com HTTPS (ex: `https://seu-dominio.com`), clicar em **Save** e depois em **Redeploy**.

#### 6. Validação
Acessar a URL final com HTTPS e confirmar se o site está online.
